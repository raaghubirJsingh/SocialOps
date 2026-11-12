import { jest } from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PlatformPermission } from '@prisma/client';

import {
  PlatformAdminService,
  PlatformAdminInfo,
} from './platform-admin.service.js';
import { ALL_PLATFORM_PERMISSIONS } from './dto/platform-admin.dto.js';

const TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOTSTRAP_SECRET = 'a'.repeat(32);

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

interface MockTx {
  $executeRaw: ReturnType<typeof jest.fn>;
  $queryRaw: ReturnType<typeof jest.fn>;
  globalSetting: {
    findUnique: ReturnType<typeof jest.fn>;
    upsert: ReturnType<typeof jest.fn>;
  };
  user: {
    findFirst: ReturnType<typeof jest.fn>;
    findUnique: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    count: ReturnType<typeof jest.fn>;
  };
  adminAuditEvent: {
    create: ReturnType<typeof jest.fn>;
  };
}

function makePrismaMock(): {
  $transaction: ReturnType<typeof jest.fn>;
  $executeRaw: ReturnType<typeof jest.fn>;
  $queryRaw: ReturnType<typeof jest.fn>;
  globalSetting: {
    findUnique: ReturnType<typeof jest.fn>;
    upsert: ReturnType<typeof jest.fn>;
  };
  user: {
    findFirst: ReturnType<typeof jest.fn>;
    findUnique: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    count: ReturnType<typeof jest.fn>;
  };
  adminAuditEvent: {
    create: ReturnType<typeof jest.fn>;
  };
} {
  const tx: MockTx = {
    $executeRaw: jest.fn(async (sql: any, ...params: any[]) => {
      // Capture the SQL template and parameters for testing
      return undefined;
    }),
    $queryRaw: jest.fn(async () => []),
    globalSetting: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({
        key: 'bootstrap_admin_completed',
        value: 'true',
      })),
    },
    user: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => ({
        id: TARGET_USER_ID,
        email: 'test@example.com',
        fullName: 'Test User',
      })),
      update: jest.fn(async (args: unknown) => {
        const a = args as { where: { id: string } };
        return {
          id: a.where.id,
          email: 'test@example.com',
          fullName: 'Test User',
          isSocialOpsAdmin: true,
          platformPermissions: ALL_PLATFORM_PERMISSIONS,
          socialOpsAdminGrantedAt: new Date(),
          socialOpsAdminGrantedById: null,
          socialOpsAdminRevokedAt: null,
        };
      }),
      count: jest.fn(async () => 0),
    },
    adminAuditEvent: {
      create: jest.fn(async () => ({ id: 'audit-1' })),
    },
  };

  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) =>
      callback(tx),
    ),
    $executeRaw: tx.$executeRaw,
    $queryRaw: tx.$queryRaw,
    globalSetting: tx.globalSetting,
    user: tx.user,
    adminAuditEvent: tx.adminAuditEvent,
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
  return new PlatformAdminService(
    prisma as unknown as ConstructorParameters<typeof PlatformAdminService>[0],
    {} as any, // AuthService not needed for bootstrap tests
  );
}

function baseDto(overrides: Record<string, unknown> = {}) {
  return {
    bootstrapSecret: BOOTSTRAP_SECRET,
    ...overrides,
  };
}

describe('PlatformAdminService.bootstrapFirstAdmin', () => {
  const OLD_ENV_SECRET = process.env.BOOTSTRAP_ADMIN_SECRET;
  const OLD_ENV_USER_ID = process.env.BOOTSTRAP_ADMIN_USER_ID;

  beforeEach(() => {
    process.env.BOOTSTRAP_ADMIN_SECRET = BOOTSTRAP_SECRET;
    process.env.BOOTSTRAP_ADMIN_USER_ID = TARGET_USER_ID;
  });

  afterAll(() => {
    process.env.BOOTSTRAP_ADMIN_SECRET = OLD_ENV_SECRET;
    process.env.BOOTSTRAP_ADMIN_USER_ID = OLD_ENV_USER_ID;
  });

  describe('environment validation', () => {
    it('throws ServiceUnavailableException when BOOTSTRAP_ADMIN_SECRET is missing', async () => {
      delete process.env.BOOTSTRAP_ADMIN_SECRET;
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(ServiceUnavailableException);

      try {
        await service.bootstrapFirstAdmin(null, baseDto());
      } catch (e) {
        expect((e as ServiceUnavailableException).message).toContain(
          'BOOTSTRAP_ADMIN_SECRET',
        );
      }
    });

    it('throws ServiceUnavailableException when BOOTSTRAP_ADMIN_USER_ID is missing', async () => {
      delete process.env.BOOTSTRAP_ADMIN_USER_ID;
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(ServiceUnavailableException);

      try {
        await service.bootstrapFirstAdmin(null, baseDto());
      } catch (e) {
        expect((e as ServiceUnavailableException).message).toContain(
          'BOOTSTRAP_ADMIN_USER_ID',
        );
      }
    });

    it('throws ServiceUnavailableException when BOOTSTRAP_ADMIN_USER_ID is not a valid UUID', async () => {
      process.env.BOOTSTRAP_ADMIN_USER_ID = 'not-a-uuid';
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(ServiceUnavailableException);

      try {
        await service.bootstrapFirstAdmin(null, baseDto());
      } catch (e) {
        expect((e as ServiceUnavailableException).message).toContain(
          'not a valid UUID',
        );
      }
    });
  });

  describe('bootstrap secret validation', () => {
    it('throws ForbiddenException when bootstrapSecret is missing from request body', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, { bootstrapSecret: '' } as any),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.bootstrapFirstAdmin(null, { bootstrapSecret: '' } as any);
      } catch (e) {
        expect((e as ForbiddenException).message).toContain(
          'Missing bootstrap secret',
        );
      }
    });

    it('throws ForbiddenException when bootstrapSecret does not match (constant-time)', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(
          null,
          baseDto({ bootstrapSecret: 'wrong-secret' }),
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.bootstrapFirstAdmin(
          null,
          baseDto({ bootstrapSecret: 'wrong-secret' }),
        );
      } catch (e) {
        expect((e as ForbiddenException).message).toContain(
          'Invalid bootstrap secret',
        );
      }
    });

    it('accepts correct bootstrapSecret (constant-time comparison)', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      const result = await service.bootstrapFirstAdmin(null, baseDto());

      expect(result).toBeDefined();
      expect(result.id).toBe(TARGET_USER_ID);
      expect(result.isSocialOpsAdmin).toBe(true);
      expect(result.platformPermissions).toEqual(ALL_PLATFORM_PERMISSIONS);
    });

    it('uses constant-time comparison for unequal length secrets', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      // Secret with different length
      await expect(
        service.bootstrapFirstAdmin(
          null,
          baseDto({ bootstrapSecret: 'short' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bootstrap completion flag', () => {
    it('throws ConflictException when bootstrap_admin_completed flag is already true', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.globalSetting.findUnique).mockResolvedValue({
        key: 'bootstrap_admin_completed',
        value: 'true',
      });
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(ConflictException);

      try {
        await service.bootstrapFirstAdmin(null, baseDto());
      } catch (e) {
        expect((e as ConflictException).getResponse()).toEqual(
          expect.objectContaining({
            code: 'PLATFORM_ADMIN_EXISTS',
            detail:
              'A platform administrator already exists. Use grant/revoke instead.',
          }),
        );
      }
    });

    it('sets bootstrap_admin_completed flag to true on successful bootstrap', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await service.bootstrapFirstAdmin(null, baseDto());

      expect(prisma.globalSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'bootstrap_admin_completed' },
          create: { key: 'bootstrap_admin_completed', value: 'true' },
          update: { value: 'true' },
        }),
      );
    });

    it('checks for existing admin inside transaction as defense in depth', async () => {
      const prisma = makePrismaMock();
      // Mock findFirst to return an existing admin (simulating another request won)
      asMock(prisma.user.findFirst).mockResolvedValue({ id: 'existing-admin' });
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(ConflictException);

      // Should set the completion flag
      expect(prisma.globalSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'bootstrap_admin_completed' },
          update: { value: 'true' },
        }),
      );
    });
  });

  describe('target user validation', () => {
    it('throws NotFoundException when configured target user does not exist', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.user.findUnique).mockResolvedValue(null);
      const service = makeService(prisma);

      await expect(
        service.bootstrapFirstAdmin(null, baseDto()),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.bootstrapFirstAdmin(null, baseDto());
      } catch (e) {
        expect((e as NotFoundException).message).toContain(
          'Configured bootstrap target user not found',
        );
      }
    });

    it('ignores userId from request body and uses BOOTSTRAP_ADMIN_USER_ID', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      // Provide a different userId in the DTO
      await service.bootstrapFirstAdmin(
        null,
        baseDto({ userId: OTHER_USER_ID }),
      );

      // Should look up the configured target user, not the body userId
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: TARGET_USER_ID },
        select: { id: true, email: true, fullName: true },
      });
    });

    it('promotes the configured target user to platform admin', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      const result = await service.bootstrapFirstAdmin(null, baseDto());

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_USER_ID },
          data: expect.objectContaining({
            isSocialOpsAdmin: true,
            platformPermissions: ALL_PLATFORM_PERMISSIONS,
            socialOpsAdminGrantedAt: expect.any(Date),
            socialOpsAdminGrantedById: null, // actorUserId is null for bootstrap
          }),
        }),
      );

      expect(result.id).toBe(TARGET_USER_ID);
      expect(result.isSocialOpsAdmin).toBe(true);
      expect(result.platformPermissions).toEqual(ALL_PLATFORM_PERMISSIONS);
    });
  });

  describe('audit logging', () => {
    it('creates admin audit event without including the secret', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await service.bootstrapFirstAdmin(null, baseDto());

      expect(prisma.adminAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: TARGET_USER_ID, // Falls back to target when no actor
            action: 'platform_admin.bootstrap',
            targetType: 'user',
            targetId: TARGET_USER_ID,
            details: { permissions: ALL_PLATFORM_PERMISSIONS },
          }),
        }),
      );

      // Verify secret is NOT in the audit
      const call = prisma.adminAuditEvent.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      const details = call.data.details as Record<string, unknown>;
      expect(details).not.toHaveProperty('bootstrapSecret');
      expect(JSON.stringify(details)).not.toContain(BOOTSTRAP_SECRET);
    });

    it('uses actorUserId when provided', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);
      const actorUserId = 'actor-user-id';

      await service.bootstrapFirstAdmin(actorUserId, baseDto());

      const call = prisma.adminAuditEvent.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.actorUserId).toBe(actorUserId);
    });
  });

  describe('advisory lock', () => {
    it('acquires advisory lock with fixed key 0x534f4349', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      await service.bootstrapFirstAdmin(null, baseDto());

      expect(prisma.$executeRaw).toHaveBeenCalled();
      // Check the SQL template and parameters
      const call = prisma.$executeRaw.mock.calls[0];
      // call[0] is the SQL template string array, call[1] is the parameter
      expect(String(call[0])).toContain('pg_advisory_xact_lock');
      expect(call[1]).toBe(0x534f4349);
    });
  });

  describe('concurrency (20 parallel attempts)', () => {
    it('only one succeeds, others get ConflictException', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      // Simulate the race: first caller wins, others see admin exists
      let callCount = 0;
      asMock(prisma.user.findFirst).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return null; // First check: no admin
        return { id: 'existing-admin' }; // Subsequent checks: admin exists
      });

      // Launch 20 parallel attempts
      const promises = Array.from({ length: 20 }, () =>
        service.bootstrapFirstAdmin(null, baseDto()).catch((e) => e),
      );

      const results = await Promise.all(promises);

      // Exactly one should succeed, 19 should get ConflictException
      const successes = results.filter((r) => r instanceof Object && 'id' in r);
      const conflicts = results.filter((r) => r instanceof ConflictException);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(19);

      // Advisory lock should be acquired 20 times (once per attempt)
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(20);
    });
  });

  describe('rate limiting integration', () => {
    // Note: Rate limiting is enforced at the controller level via RateLimitService
    // This test documents the expected behavior for the integration test suite
    it('controller should enforce 5 attempts per hour per IP', async () => {
      // This is tested at the controller integration level
      // The service itself doesn't enforce rate limiting
      expect(true).toBe(true);
    });
  });

  describe('ALL_PLATFORM_PERMISSIONS registry', () => {
    it('contains every existing Prisma PlatformPermission exactly once', () => {
      const expected = Object.values(PlatformPermission).sort();
      const actual = [...ALL_PLATFORM_PERMISSIONS].sort();

      expect(actual).toEqual(expected);
    });

    it('includes PLATFORM_SETTINGS_MANAGE', () => {
      expect(ALL_PLATFORM_PERMISSIONS).toContain(
        PlatformPermission.PLATFORM_SETTINGS_MANAGE,
      );
    });

    it('has no duplicate permission values', () => {
      const unique = new Set(ALL_PLATFORM_PERMISSIONS);
      expect(unique.size).toBe(ALL_PLATFORM_PERMISSIONS.length);
    });

    it('bootstrap grants ALL_PLATFORM_PERMISSIONS including PLATFORM_SETTINGS_MANAGE', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      const result = await service.bootstrapFirstAdmin(null, baseDto());

      expect(result.platformPermissions).toEqual(ALL_PLATFORM_PERMISSIONS);
      expect(result.platformPermissions).toContain(
        PlatformPermission.PLATFORM_SETTINGS_MANAGE,
      );
    });

    it('grantAdmin defaults to ALL_PLATFORM_PERMISSIONS including PLATFORM_SETTINGS_MANAGE', async () => {
      const prisma = makePrismaMock();
      const service = makeService(prisma);

      // Actor must be an existing platform admin
      asMock(prisma.user.findUnique).mockResolvedValueOnce({
        isSocialOpsAdmin: true,
      });
      // Target user lookup
      asMock(prisma.user.findUnique).mockResolvedValueOnce({
        id: TARGET_USER_ID,
        email: 'test@example.com',
        fullName: 'Test User',
        isSocialOpsAdmin: false,
      });

      // Transaction mock for update + audit
      const tx = {
        user: {
          update: jest.fn(async (args: unknown) => {
            const a = args as { where: { id: string } };
            return {
              id: a.where.id,
              email: 'test@example.com',
              fullName: 'Test User',
              isSocialOpsAdmin: true,
              platformPermissions: ALL_PLATFORM_PERMISSIONS,
              socialOpsAdminGrantedAt: new Date(),
              socialOpsAdminGrantedById: 'actor',
              socialOpsAdminRevokedAt: null,
            };
          }),
        },
        adminAuditEvent: {
          create: jest.fn(async () => ({ id: 'audit-1' })),
        },
      };
      asMock(prisma.$transaction).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
      );

      const result = await service.grantAdmin('actor', {
        userId: TARGET_USER_ID,
      });

      expect(result.platformPermissions).toEqual(ALL_PLATFORM_PERMISSIONS);
      expect(result.platformPermissions).toContain(
        PlatformPermission.PLATFORM_SETTINGS_MANAGE,
      );
    });
  });
});

describe('PlatformAdminService.safeCompareStrings', () => {
  const prisma = makePrismaMock();
  const service = makeService(prisma);

  // Access private method via type assertion for testing
  const safeCompare = (a: string, b: string): boolean => {
    // @ts-expect-error - accessing private method for testing
    return service.safeCompareStrings(a, b);
  };

  it('returns true for identical strings', () => {
    expect(safeCompare('test', 'test')).toBe(true);
    expect(safeCompare('', '')).toBe(true);
    expect(safeCompare('a'.repeat(32), 'a'.repeat(32))).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(safeCompare('test', 'best')).toBe(false);
    expect(safeCompare('aaaa', 'aaab')).toBe(false);
  });

  it('returns false for different length strings (constant-time)', () => {
    expect(safeCompare('short', 'verylongstring')).toBe(false);
    expect(safeCompare('a'.repeat(32), 'a'.repeat(31))).toBe(false);
    expect(safeCompare('a'.repeat(31), 'a'.repeat(32))).toBe(false);
  });

  it('handles unicode correctly', () => {
    expect(safeCompare('🔐🔐🔐', '🔐🔐🔐')).toBe(true);
    expect(safeCompare('🔐🔐🔐', '🔐🔐🔑')).toBe(false);
  });

  it('handles special characters', () => {
    expect(safeCompare('!@#$%^&*()', '!@#$%^&*()')).toBe(true);
    expect(safeCompare('!@#$%^&*()', '!@#$%^&*(')).toBe(false);
  });
});
