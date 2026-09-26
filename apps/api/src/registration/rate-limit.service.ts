import { HttpException, Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';

import {
  REGISTRATION_RATE_LIMITS,
  REGISTRATION_RATE_WINDOW_SECONDS,
} from './constants/registration.constants.js';

/**
 * Redis fixed-window rate limiting for Registration Phase v1.0
 * (L15/OPEN-3 - EXACT approved budgets):
 *
 *   - registration start : 5  / 15 min / IP
 *   - OTP verify         : 10 / 15 min / IP + registration
 *   - OTP resend         : 6  / 15 min / IP + channel
 *   - password           : 5  / 15 min / IP + registration
 *   - resume             : 10 / 15 min / IP
 *
 * Over limit -> HTTP 429 + Retry-After (seconds remaining in window).
 *
 * Scope discipline (L15): this limiter applies ONLY to the five new
 * registration operations. Existing login/refresh/logout/employee auth
 * endpoints are deliberately NOT rate-limited in this phase, and no
 * new rate-limit package is installed - only the existing ioredis
 * client behind RedisService.
 *
 * Orthogonality: these budgets throttle REQUEST VOLUME. The OTP
 * wrong-attempt rules (3 wrong -> 1-hour lock) and the 3-successful-
 * resend cap live on RegistrationOtp/PendingRegistration and are a
 * completely separate mechanism.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export type RegistrationRateBucket = keyof typeof REGISTRATION_RATE_LIMITS;

/** Fixed-window INCR + EXPIRE via the existing Redis client. */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(
    bucket: RegistrationRateBucket,
    parts: { ip: string; scope?: string; channel?: string },
  ): Promise<RateLimitResult> {
    const limit = REGISTRATION_RATE_LIMITS[bucket];
    const windowSeconds = REGISTRATION_RATE_WINDOW_SECONDS;

    // Raw resumeTokens never appear in keys: callers pass the SHA-256.
    const key = [
      'rl:reg',
      bucket,
      parts.ip,
      parts.scope ?? '',
      parts.channel ?? '',
    ]
      .filter(Boolean)
      .join(':');

    const client = this.redis.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    } else {
      // Repair path: if a previous crash left the key without a TTL,
      // re-arm it now so the window can never become permanent.
      const ttl = await client.ttl(key);
      if (ttl === -1) {
        await client.expire(key, windowSeconds);
      }
    }

    if (count > limit) {
      let ttl = await client.ttl(key);
      if (ttl < 1) ttl = windowSeconds;
      return { allowed: false, retryAfterSeconds: ttl, remaining: 0 };
    }

    return { allowed: true, retryAfterSeconds: 0, remaining: limit - count };
  }

  /** Build the standard 429 (with Retry-After already set by the caller). */
  static rateLimitException(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many requests, please try again later',
        retryAfterSeconds,
      },
      429,
    );
  }

  /** Convenience: approved budgets (exposed for tests/Swagger docs). */
  static get limits(): typeof REGISTRATION_RATE_LIMITS {
    return REGISTRATION_RATE_LIMITS;
  }

  static get windowSeconds(): number {
    return REGISTRATION_RATE_WINDOW_SECONDS;
  }
}
