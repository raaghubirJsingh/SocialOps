import type { RedisOptions } from 'ioredis';

/**
 * Connection options for the shared application Redis client.
 *
 * Deliberately fail-fast (AGENTS.md section 11): commands must never be
 * silently buffered and "succeed" later against a server that was
 * unreachable when they were issued.
 */
export function buildRedisOptions(): RedisOptions {
  return {
    // Start connecting immediately on construction.
    lazyConnect: false,
    // Reject commands issued while disconnected instead of queueing them.
    enableOfflineQueue: false,
    // Fail an individual request quickly while the connection is down;
    // background reconnection is still handled by retryStrategy below.
    maxRetriesPerRequest: 1,
    // Bounded exponential backoff for reconnection attempts (200ms .. 2s).
    retryStrategy: (times: number) => Math.min(times * 200, 2_000),
  };
}