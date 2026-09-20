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
  constructor(private readonly oauth: SocialAccountsOAuthService) {}

  @Get('callback/:platform')
  @ApiExcludeEndpoint() // browser-facing redirect; kept out of Swagger paths
  @ApiOkResponse({ description: '302 redirect to the frontend.' })
  async callback(
    @Param('platform') rawPlatform: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendBase = (
      process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
    ).replace(/\/$/, '');

    if (!isSocialPlatform(rawPlatform) || !state) {
      res.redirect(`${frontendBase}/?status=oauth_state_invalid`);
      return;
    }
    if (!code) {
      // User denied consent at the platform - a normal, non-hostile exit.
      res.redirect(
        `${frontendBase}/?status=oauth_denied&platform=${rawPlatform}`,
      );
      return;
    }

    try {
      await this.oauth.completeConnect(rawPlatform, code, state);
      res.redirect(
        `${frontendBase}/?status=connected&platform=${rawPlatform}`,
      );
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
      res.redirect(`${frontendBase}/?status=${errorCode}&platform=${rawPlatform}`);
    }
  }
}