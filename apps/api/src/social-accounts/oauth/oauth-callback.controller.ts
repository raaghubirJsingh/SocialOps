import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { isSocialPlatform } from '../../social-accounts/constants/social-platforms.js';
import { Public } from '../../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../../rbac/decorators/public-auth.decorator.js';
import { OAuthStateService } from './oauth-state.service.js';
import type { OAuthStatePayload } from './oauth-state.service.js';
import { SocialAccountsOAuthService } from './social-accounts-oauth.service.js';

/**
 * Error codes carried to the frontend via the redirect query. Deliberately
 * coarse: the browser must never learn WHY a handshake failed beyond the
 * standard stage buckets (no user/org leakage, no stack traces).
 */
type CallbackErrorCode =
  | 'oauth_denied'
  | 'oauth_state_invalid'
  | 'oauth_forbidden'
  | 'oauth_exchange_failed';

/**
 * Public OAuth callback (Decision 013).
 *
 * `@PublicAuth()` + `@Public()` are REQUIRED here: the browser arrives from
 * the platform, carrying no Bearer token and no X-Organization-Id header.
 * This bypasses ONLY the guards - the signed, single-use state plus
 * callback-time tenant re-verification inside the service are the actual
 * security controls. The response is ALWAYS a 302 redirect to the frontend
 * with a status marker; a token is never placed in any response.
 */
@ApiTags('social-accounts')
@Controller('social-accounts')
export class SocialAccountOAuthCallbackController {
  constructor(
    private readonly oauth: SocialAccountsOAuthService,
    private readonly state: OAuthStateService,
  ) {}

  @Get('callback/:platform')
  // REQUIRED: the browser arrives from the platform carrying no Bearer token
  // and no X-Organization-Id header. Without these the global JwtAuthGuard
  // rejects the redirect with 401 before the controller ever runs, and the
  // handshake can never complete. `@PublicAuth()` skips ONLY the JWT check
  // (there is no session to present); `@Public()` skips ONLY the
  // organization-context requirement (there is no organization header to
  // send). The actual authorization controls are untouched: the HMAC-signed,
  // single-use state, plus the callback-time ownership + ACTIVE-relationship
  // re-verification performed in completeConnect().
  @PublicAuth()
  @Public()
  @ApiExcludeEndpoint() // browser-facing redirect; kept out of Swagger paths
  @ApiOkResponse({ description: '302 redirect to the frontend.' })
  /**
   * Resolve where to send the browser after the handshake (Design A).
   *
   * The destination is DERIVED SERVER-SIDE from the verified tenant context in
   * the state - never from a client-supplied path. Accepting a `returnTo` from
   * the browser would be an open-redirect: the state is HMAC-signed, which
   * proves we minted it, but the USER starts the flow and would choose the
   * value, so they could aim the post-consent redirect at an attacker's site
   * while still passing through our real handshake. Deriving the path from
   * `clientId` + `source` removes that surface entirely - there is nothing for
   * a caller to tamper with.
   *
   * Falls back to `/` only when no verified payload exists (invalid/missing
   * state), which is the one case where the destination genuinely is unknown.
   */
  private destinationFor(payload: OAuthStatePayload | null): string {
    if (!payload) return '/';
    return payload.source === 'AGENCY'
      ? `/clients/${encodeURIComponent(payload.clientId)}/social-accounts`
      : `/client/social-accounts?clientId=${encodeURIComponent(payload.clientId)}`;
  }

  async callback(
    @Param('platform') rawPlatform: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendBase = (
      process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    // Every redirect is absolute, built from the configured base plus a
    // destination WE derived - never from untrusted input.
    const to = (destination: string, status: string, platform?: string) => {
      const params = new URLSearchParams({ status });
      if (platform) params.set('platform', platform);
      res.redirect(`${frontendBase}${destination}?${params.toString()}`);
    };

    if (!isSocialPlatform(rawPlatform) || !state) {
      to('/', 'oauth_state_invalid');
      return;
    }

    // Verify + consume the state HERE so the destination is known before the
    // exchange and on every failure path. completeConnect receives the
    // already-verified payload and therefore never re-consumes the nonce.
    let payload: OAuthStatePayload;
    try {
      payload = await this.state.verify(state);
    } catch {
      // Forged, expired or replayed state: indistinguishable to the browser.
      to('/', 'oauth_state_invalid');
      return;
    }

    const destination = this.destinationFor(payload);

    if (!code) {
      // User denied consent at the platform - a normal, non-hostile exit.
      to(destination, 'oauth_denied', rawPlatform);
      return;
    }

    try {
      await this.oauth.completeConnect(rawPlatform, code, payload);
      to(destination, 'connected', rawPlatform);
    } catch (error) {
      let errorCode: CallbackErrorCode = 'oauth_exchange_failed';
      if (
        error instanceof UnauthorizedException
      ) {
        errorCode = 'oauth_state_invalid';
      } else if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        errorCode = 'oauth_forbidden';
      }
      to(destination, errorCode, rawPlatform);
    }
  }
}