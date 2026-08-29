import type { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';

function stubClient(overrides: Partial<Record<string, unknown>> = {}): Redis {
  return {
    status: 'ready',
    ping: vi.fn(async () => 'PONG'),
    quit: vi.fn(async () => 'OK'),
    once: vi.fn(),
    ...overrides,
  } as unknown as Redis;
}

describe('RedisService', () => {
  it('delegates ping to the shared client', async () => {
    const client = stubClient();
    const service = new RedisService(client);

    await expect(service.ping()).resolves.toBe('PONG');
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it('exposes the shared client for bounded modules', () => {
    const client = stubClient();
    const service = new RedisService(client);

    expect(service.getClient()).toBe(client);
  });

  it('quits gracefully on module destroy', async () => {
    const client = stubClient();
    const service = new RedisService(client);

    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('swallows quit failures when the connection is already gone', async () => {
    const client = stubClient({
      quit: vi.fn(async () => {
        throw new Error('Connection is closed.');
      }),
    });
    const service = new RedisService(client);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('waits for readiness on module init when the client is still connecting', async () => {
    let readyCallback: (() => void) | undefined;
    const client = stubClient({
      status: 'connecting',
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'ready') {
          readyCallback = listener;
        }
        return client;
      }),
    });
    const service = new RedisService(client);

    const init = service.onModuleInit();
    readyCallback?.();
    await expect(init).resolves.toBeUndefined();
  });

  it('fails fast when the client never becomes ready', async () => {
    vi.useFakeTimers();
    try {
      const client = stubClient({ status: 'connecting', once: vi.fn().mockReturnThis() });
      const service = new RedisService(client);

      const init = service.onModuleInit();
      const assertion = expect(init).rejects.toThrow(/did not become ready/);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});