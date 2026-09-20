import { createHmac, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service.js';
import { hmacKey, TokenEncryptionService } from '../../crypto/token-encryption.service.js';
import type { SocialPlatformValue } from '../../social-accounts/constants/social-platforms.js';

/** OAuth state TTL: 10 minutes - a connect flow completes in seconds. */
const STATE_TTL_SECONDS = 600;

/**
 * Signed CSRF state payload (Decision 013).
 *
 * `sub` + `organizationId` + `clientId` bind the handshake to the verified
 * tenant context at connect time; the callback re-proves BOTH server-side
 * before any token is stored (a state minted against a since-terminated
 * relationship is refused).
 */
export interface OAuthStatePayload {
  sub: string;
  organizationId: string;
  clientId: string;
  platform: SocialPlatformValue;
  source: 'AGENCY' | 'CLIENT';
  nonce: string;
  iat: number;
  exp: number;
  aud: 'social-connect';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * CSRF state service (Decision 013).
 *
 * Two independent layers:
 *  1. AUTHENTICITY - HMAC-SHA256 over the base64url payload with a DEDICATED
 *     OAUTH_STATE_SECRET (never a JWT secret). Signature compared in
 *     constant time.
 *  2. REPLAY PROTECTION - the payload nonce is registered once in Redis
 *     (SET NX, same TTL) and consumed atomically (DEL) at verify time, so a
 *     captured state cannot be replayed within its validity window.
 */
@Injectable()
export class OAuthStateService {
  constructor(
    private readonly redis: RedisService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  private secret(): Buffer {
    const secret = process.env.OAUTH_STATE_SECRET;
    if (!secret) {
      throw new UnauthorizedException('OAuth state signing is not configured');
    }
    return hmacKey(secret);
  }

  /** Mint + register a state string for one connect flow. */
  async mint(
    payload: Omit<OAuthStatePayload, 'nonce' | 'iat' | 'exp' | 'aud'>,
  ): Promise<string> {
    const nonce = b64url(randomBytes(32));
    const now = Math.floor(Date.now() / 1000);
    const full: OAuthStatePayload = {
      ...payload,
      nonce,
      iat: now,
      exp: now + STATE_TTL_SECONDS,
      aud: 'social-connect',
    };
    const body = b64url(JSON.stringify(full));
    const signature = b64url(
      createHmac('sha256', this.secret()).update(body).digest(),
    );
    // Register the nonce for single use. NX: a nonce collision (virtually
    // impossible for 32 random bytes) would fail loudly rather than replay.
    const registered = await this.redis
      .getClient()
      .set(`oauth:state:${nonce}`, '1', 'EX', STATE_TTL_SECONDS, 'NX');
    if (registered !== 'OK') {
      throw new UnauthorizedException('OAuth state could not be registered');
    }
    return `${body}.${signature}`;
  }

  /**
   * Verify signature, audience and expiry, then atomically consume the
   * nonce. Any failure is a uniform 401 - a forged, expired, or replayed
   * state is indistinguishable to the caller.
   */
  async verify(state: string): Promise<OAuthStatePayload> {
    const dot = state.lastIndexOf('.');
    if (dot <= 0) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    const body = state.slice(0, dot);
    const signature = state.slice(dot + 1);

    const expected = createHmac('sha256', this.secret()).update(body).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (!this.crypto.safeEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    if (
      payload.aud !== 'social-connect' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    // Atomic single-use consume: DEL returns the number of keys removed.
    const consumed = await this.redis
      .getClient()
      .del(`oauth:state:${payload.nonce}`);
    if (consumed !== 1) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    return payload;
  }
}