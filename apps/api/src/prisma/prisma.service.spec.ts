import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('connects on module init and disconnects on module destroy', async () => {
    // Placeholder URL for construction only - the spies below prevent any
    // real connection attempt (unit test, not an integration test).
    process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
    const service = new PrismaService();
    const connect = vi.spyOn(service, '$connect').mockResolvedValue(undefined);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates connection failures (fail fast, no silent fallback)', async () => {
    process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
    const service = new PrismaService();
    vi.spyOn(service, '$connect').mockRejectedValue(new Error('connection refused'));

    await expect(service.onModuleInit()).rejects.toThrow('connection refused');
  });
});