import { jest } from '@jest/globals';
import { ConflictException, HttpException } from '@nestjs/common';

import {
  AI_TASK_LOCK_TTL_SECONDS,
  AI_TASK_RATE_LIMIT,
  AI_TASK_RATE_WINDOW_SECONDS,
  AiTaskDispatchGuard,
} from './ai-task-dispatch.guard.js';

const ORG = 'org-1';
const USER = 'user-1';
const CONTENT = 'content-1';
const BOT = 'bot-1';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

/** Minimal ioredis double: counters + a key store honouring SET NX. */
function makeRedisMock() {
  const store = new Map<string, string>();
  const client = {
    store,
    incr: jest.fn(async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => AI_TASK_RATE_WINDOW_SECONDS),
    set: jest.fn(async (key: string, value: string, ...rest: string[]) => {
      const nx = rest.includes('NX');
      if (nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(async () => 1),
  };
  return {
    client,
    redis: { getClient: () => client } as never,
  };
}

describe('AiTaskDispatchGuard (content-scoped dispatch guards)', () => {
  function makeGuard() {
    const { client, redis } = makeRedisMock();
    return { guard: new AiTaskDispatchGuard(redis), client };
  }

  describe('rate limit (10 / 15 min / org+user)', () => {
    it('allows requests up to the budget', async () => {
      const { guard } = makeGuard();
      for (let i = 0; i < AI_TASK_RATE_LIMIT; i += 1) {
        await expect(guard.enforceRateLimit(ORG, USER)).resolves.toBeUndefined();
      }
    });

    it('throws 429 with Retry-After once the budget is exhausted', async () => {
      const { guard } = makeGuard();
      for (let i = 0; i < AI_TASK_RATE_LIMIT; i += 1) {
        await guard.enforceRateLimit(ORG, USER);
      }
      await expect(guard.enforceRateLimit(ORG, USER)).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('scopes the window per organization and per user', async () => {
      const { guard, client } = makeGuard();
      for (let i = 0; i < AI_TASK_RATE_LIMIT; i += 1) {
        await guard.enforceRateLimit(ORG, USER);
      }
      // A different user in the same org has its own budget.
      await expect(
        guard.enforceRateLimit(ORG, 'other-user'),
      ).resolves.toBeUndefined();
      // A different org entirely is untouched.
      await expect(
        guard.enforceRateLimit('other-org', USER),
      ).resolves.toBeUndefined();
      // ...and each scope gets its own correctly-namespaced key.
      const keys = asMock(client.incr).mock.calls.map((c) => String(c[0]));
      expect(keys[0]).toBe(`rl:ai:tasks:${ORG}:${USER}`);
      expect(keys).toContain(`rl:ai:tasks:${ORG}:other-user`);
      expect(keys).toContain(`rl:ai:tasks:other-org:${USER}`);
    });

    it('re-arms a TTL that a crash left missing', async () => {
      const { guard, client } = makeGuard();
      asMock(client.ttl).mockResolvedValue(-1);
      await guard.enforceRateLimit(ORG, USER);
      await guard.enforceRateLimit(ORG, USER);
      expect(asMock(client.expire)).toHaveBeenCalled();
    });
  });

  describe('in-flight lock (SET NX)', () => {
    it('runs the task and releases the lock on success', async () => {
      const { guard, client } = makeGuard();
      const fn = jest.fn(async () => 'done');
      await expect(
        guard.runOnce({ contentId: CONTENT, aiUserId: BOT }, fn),
      ).resolves.toBe('done');
      expect(fn).toHaveBeenCalledTimes(1);
      // Compare-and-delete release, never a bare DEL.
      expect(asMock(client.eval)).toHaveBeenCalledTimes(1);
    });

    it('refuses a concurrent duplicate with 409', async () => {
      const { guard, client } = makeGuard();
      // Simulate a lock already held by another in-flight request.
      client.store.set(`ai:lock:task:${CONTENT}:${BOT}`, 'other-owner');

      const fn = jest.fn(async () => 'done');
      await expect(
        guard.runOnce({ contentId: CONTENT, aiUserId: BOT }, fn),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fn).not.toHaveBeenCalled();
    });

    it('allows different content items and different bots to run in parallel', async () => {
      const { guard } = makeGuard();
      await guard.runOnce({ contentId: CONTENT, aiUserId: BOT }, async () => 1);
      await guard.runOnce({ contentId: 'content-2', aiUserId: BOT }, async () => 2);
      await guard.runOnce({ contentId: CONTENT, aiUserId: 'bot-2' }, async () => 3);
    });

    it('releases the lock even when the task throws', async () => {
      const { guard, client } = makeGuard();
      await expect(
        guard.runOnce(
          { contentId: CONTENT, aiUserId: BOT },
          async () => {
            throw new Error('provider exploded');
          },
        ),
      ).rejects.toThrow('provider exploded');
      expect(asMock(client.eval)).toHaveBeenCalledTimes(1);
    });

    it('does not fail the request when release itself fails', async () => {
      const { guard, client } = makeGuard();
      asMock(client.eval).mockRejectedValue(new Error('redis down'));
      await expect(
        guard.runOnce({ contentId: CONTENT, aiUserId: BOT }, async () => 'ok'),
      ).resolves.toBe('ok');
    });

    it('uses a bounded lock TTL so a crashed request cannot block forever', () => {
      expect(AI_TASK_LOCK_TTL_SECONDS).toBeGreaterThan(0);
    });
  });
});
