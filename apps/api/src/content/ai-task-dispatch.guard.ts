import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { RedisService } from '../redis/redis.service.js';

/**
 * Content-scoped dispatch guards for the AI Employee Fleet (`/ai-tasks`).
 *
 * SCOPE DISCIPLINE: these budgets belong to the CONTENT module. They are
 * deliberately NOT implemented in `registration/rate-limit.service.ts` —
 * the Registration Phase v1.0 budgets are frozen constants (Rule 21) and
 * coupling content traffic to them would weaken that contract. Only the
 * existing `ioredis` client behind RedisService is used; no new package.
 *
 * Two independent, approved guards:
 *
 *   1. RATE LIMIT - 10 requests / 15 min / organization + user. Every
 *      dispatch spends a paid LLM call, so this bounds blast radius.
 *      Over budget -> HTTP 429 with Retry-After.
 *
 *   2. IN-FLIGHT LOCK - a Redis SET NX guard keyed on
 *      (contentId, aiUserId). The provider call is synchronous, so a
 *      double-click (or two tabs) would otherwise fire two concurrent
 *      generations and pay twice for the same work. A deliberate later
 *      re-dispatch is still allowed: the lock is released when the call
 *      settles, so only CONCURRENT duplicates are refused (409).
 *
 * This is a concurrency guard, not a request-key idempotency store: no
 * result cache is kept and no client-supplied idempotency key is trusted.
 */
export const AI_TASK_RATE_LIMIT = 10;
export const AI_TASK_RATE_WINDOW_SECONDS = 900;

/**
 * Lock lifetime. Comfortably exceeds the default LLM timeout (30s) so a
 * slow provider cannot let a second dispatch through while the first is
 * still running. It is a safety ceiling, not a normal wait: the lock is
 * released explicitly in the `finally` below.
 */
export const AI_TASK_LOCK_TTL_SECONDS = 60;

/**
 * Compare-and-delete so we only ever release OUR OWN lock. A plain DEL
 * could delete a lock a different request legitimately acquired after ours
 * expired.
 */
const RELEASE_IF_OWNER_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

@Injectable()
export class AiTaskDispatchGuard {
  private readonly logger = new Logger(AiTaskDispatchGuard.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Fixed-window throttle for AI dispatches, scoped to org + user.
   * Throws a 429 (with Retry-After) when the budget is exhausted.
   */
  async enforceRateLimit(organizationId: string, userId: string): Promise<void> {
    const key = `rl:ai:tasks:${organizationId}:${userId}`;
    const client = this.redis.getClient();

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, AI_TASK_RATE_WINDOW_SECONDS);
    } else {
      // Repair path: a crash between INCR and EXPIRE must never leave a
      // permanent window (the counter would then block the user forever).
      const ttl = await client.ttl(key);
      if (ttl === -1) {
        await client.expire(key, AI_TASK_RATE_WINDOW_SECONDS);
      }
    }

    if (count <= AI_TASK_RATE_LIMIT) return;

    let retryAfter = await client.ttl(key);
    if (retryAfter < 1) retryAfter = AI_TASK_RATE_WINDOW_SECONDS;

    throw new HttpException(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message:
          'AI task dispatch limit reached, please try again later',
        retryAfterSeconds: retryAfter,
      },
      429,
    );
  }

  /**
   * Run `fn` at most once concurrently for a given (contentId, aiUserId).
   * A concurrent duplicate is refused with 409; the lock is always
   * released when the call settles, success or failure.
   */
  async runOnce<T>(
    ids: { contentId: string; aiUserId: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `ai:lock:task:${ids.contentId}:${ids.aiUserId}`;
    const client = this.redis.getClient();
    const owner = randomUUID();

    const acquired = await client.set(
      key,
      owner,
      'EX',
      AI_TASK_LOCK_TTL_SECONDS,
      'NX',
    );
    if (acquired !== 'OK') {
      throw new ConflictException({
        code: 'AI_TASK_IN_FLIGHT',
        message:
          'An AI task for this content item is already running. Please wait for it to finish.',
      });
    }

    try {
      return await fn();
    } finally {
      try {
        await client.eval(RELEASE_IF_OWNER_LUA, 1, key, owner);
      } catch (error) {
        // Never fail the request because cleanup failed: the TTL above
        // bounds the lock's life regardless. Log and move on.
        this.logger.warn(
          `Failed to release AI task lock ${key}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
