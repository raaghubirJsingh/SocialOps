/**
 * Stage B real-instance integration tests for the Redis (ioredis) foundation.
 *
 * Rules (AGENTS.md section 11):
 *  - Runs against a REAL Redis-compatible server via REDIS_URL - never a mock.
 *    Locally (checkpoint B4): Memurai Developer - explicitly NOT official
 *    Redis, dev/test only per decision D2. In CI: redis:7-alpine.
 *  - Failures surface loudly; there are no skips and no silent fallbacks.
 *
 * Executed via `npm run test:integration --workspace=apps/api`.
 */
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { buildRedisOptions } from '../src/redis/redis-options.js';

if (!process.env.REDIS_URL) {
  // Fail loudly instead of silently connecting to a default endpoint.
  throw new Error(
    'REDIS_URL is not set - integration tests require a real instance (see .env.example).',
  );
}

const redis = new Redis(process.env.REDIS_URL, buildRedisOptions());

// ioredis emits an `error` event whenever the connection fails or is reset
// mid-stream.  Without a listener Node escalates it to an "unhandled error"
// and Vitest marks the test suite as failed even if the test assertions
// themselves pass.  We intentionally swallow the event here; surface-level
// failures still surface as rejected promises on individual commands.
redis.on('error', () => {
  /* no-op: the test asserts on the rejected promise / reconnection. */
});

/**
 * Wait for the ioredis client to reach the `ready` state.
 *
 * `buildRedisOptions` deliberately sets `enableOfflineQueue: false` so that
 * production commands fail fast instead of being silently buffered. In the
 * test, this means the very first `ping()` in `beforeAll` can race with the
 * `connect` -> `ready` transition. We explicitly wait for `ready` here to
 * honour the fail-fast contract at the application level while keeping the
 * test stable.
 */
const waitUntilReady = (): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (redis.status === 'ready') {
      resolve();
      return;
    }
    const onReady = (): void => {
      redis.off('error', onError);
      resolve();
    };
    const onError = (err: Error): void => {
      redis.off('ready', onReady);
      reject(err);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });

const keys: string[] = [];
const trackedKey = (name: string): string => {
  const key = `stageb:int:${randomUUID()}:${name}`;
  keys.push(key);
  return key;
};

beforeAll(async () => {
  // Fail fast when the instance is unreachable.
  await waitUntilReady();
  await redis.ping();
});

afterAll(async () => {
  try {
    // Clean up only this run's keys (no FLUSHDB against a shared instance).
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  } catch {
    // The connection may already be gone (e.g., failed beforeAll); nothing to clean up.
  }
});

describe('Redis foundation (real ioredis client)', () => {
  it('answers PING with PONG', async () => {
    await expect(redis.ping()).resolves.toBe('PONG');
  });

  it('round-trips SET/GET', async () => {
    const key = trackedKey('string');
    await redis.set(key, 'socialops-stage-b');
    await expect(redis.get(key)).resolves.toBe('socialops-stage-b');
  });

  it('returns null for missing keys', async () => {
    await expect(redis.get(trackedKey('missing'))).resolves.toBeNull();
  });

  it('deletes keys', async () => {
    const key = trackedKey('todelete');
    await redis.set(key, 'value');
    await redis.del(key);
    await expect(redis.get(key)).resolves.toBeNull();
  });

  it('applies expiry (SET EX / TTL)', async () => {
    const key = trackedKey('ttl');
    await redis.set(key, 'value', 'EX', 120);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('supports atomic counters (INCR)', async () => {
    const key = trackedKey('counter');
    await expect(redis.incr(key)).resolves.toBe(1);
    await expect(redis.incr(key)).resolves.toBe(2);
  });
});