import { buildRedisOptions } from './redis-options.js';

describe('buildRedisOptions', () => {
  it('configures fail-fast behavior (no silent queueing, no lazy fallback)', () => {
    const options = buildRedisOptions();

    expect(options.lazyConnect).toBe(false);
    expect(options.enableOfflineQueue).toBe(false);
    expect(options.maxRetriesPerRequest).toBe(1);
  });

  it('bounds the reconnect backoff between 200ms and 2s', () => {
    const strategy = buildRedisOptions().retryStrategy;

    expect(strategy).toBeDefined();
    expect(strategy?.(1)).toBe(200);
    expect(strategy?.(5)).toBe(1_000);
    expect(strategy?.(100)).toBe(2_000);
  });
});