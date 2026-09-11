import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { MobileVerificationToken } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  MobileVerificationService,
  sha256Hex,
} from './mobile-verification.service.js';
import { MOBILE_VERIFICATION_TOKEN_TTL_MS } from './constants/mobile-verification.constants.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

type MockFn = ReturnType<typeof jest.fn>;
const asMock = (fn: unknown): MockFn => fn as MockFn;

function makePrismaMock() {
  return {
    mobileVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
  return new MobileVerificationService(prisma as unknown as PrismaService);
}

function makeRecord(
  overrides: Partial<MobileVerificationToken> = {},
): MobileVerificationToken {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    clientId: CLIENT_ID,
    requestedByUserId: null,
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as MobileVerificationToken;
}

describe('MobileVerificationService (D3)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: MobileVerificationService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = makeService(prisma);
  });

  describe('issueVerificationToken', () => {
    it('persists ONLY the SHA-256 hash - never the raw token', async () => {
      const { rawToken } = await service.issueVerificationToken(CLIENT_ID);

      const create = asMock(prisma.mobileVerificationToken.create);
      expect(create).toHaveBeenCalledTimes(1);
      const data = create.mock.calls[0][0].data as Record<string, unknown>;

      expect(Object.keys(data).sort()).toEqual([
        'clientId',
        'expiresAt',
        'requestedByUserId',
        'tokenHash',
      ]);
      expect(data.tokenHash).toBe(sha256Hex(rawToken));
      expect(data.tokenHash).not.toContain(rawToken);
      expect(JSON.stringify(data)).not.toContain(rawToken);
    });

    it('hashes with SHA-256 (known vector)', () => {
      expect(sha256Hex('test')).toBe(
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      );
    });

    it('sets the approved 24-hour expiry window', async () => {
      const before = Date.now();
      const { expiresAt } = await service.issueVerificationToken(CLIENT_ID);
      const after = Date.now();

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + MOBILE_VERIFICATION_TOKEN_TTL_MS,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        after + MOBILE_VERIFICATION_TOKEN_TTL_MS,
      );
    });

    it('records the requesting user for audit when provided', async () => {
      await service.issueVerificationToken(CLIENT_ID, USER_ID);
      const data = asMock(prisma.mobileVerificationToken.create).mock
        .calls[0][0].data as Record<string, unknown>;
      expect(data.requestedByUserId).toBe(USER_ID);
    });

    it('delivers via dev-log ONLY when the BOOT_ARTIFACTS gate is open', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      try {
        const { rawToken } = await service.issueVerificationToken(
          CLIENT_ID,
          null,
          { BOOT_ARTIFACTS_ALLOWED: 'true' } as NodeJS.ProcessEnv,
        );
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(String(logSpy.mock.calls[0][0])).toContain(rawToken);
      } finally {
        logSpy.mockRestore();
      }
    });

    it('is fully silent (nothing logged) when the gate is closed', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      try {
        await service.issueVerificationToken(
          CLIENT_ID,
          null,
          {} as NodeJS.ProcessEnv,
        );
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe('consumeVerificationToken', () => {
    it('marks a valid token consumed exactly once', async () => {
      const record = makeRecord();
      asMock(prisma.mobileVerificationToken.findUnique).mockResolvedValue(
        record,
      );

      const result = await service.consumeVerificationToken(
        CLIENT_ID,
        'raw-token',
      );

      expect(result.outcome).toBe('CONSUMED');
      const update = asMock(prisma.mobileVerificationToken.update);
      expect(update).toHaveBeenCalledTimes(1);
      const updateArgs = update.mock.calls[0][0] as {
        where: { id: string };
        data: { usedAt: Date };
      };
      expect(updateArgs.where.id).toBe(record.id);
      expect(updateArgs.data.usedAt).toBeInstanceOf(Date);
    });

    it('rejects an unknown token without state change (no early success)', async () => {
      asMock(prisma.mobileVerificationToken.findUnique).mockResolvedValue(null);

      const result = await service.consumeVerificationToken(
        CLIENT_ID,
        'unknown',
      );

      expect(result.outcome).toBe('NOT_FOUND');
      expect(
        asMock(prisma.mobileVerificationToken.update),
      ).not.toHaveBeenCalled();
    });

    it('rejects an already-used token (single-use enforcement)', async () => {
      asMock(prisma.mobileVerificationToken.findUnique).mockResolvedValue(
        makeRecord({ usedAt: new Date() }),
      );

      const result = await service.consumeVerificationToken(
        CLIENT_ID,
        'raw-token',
      );

      expect(result.outcome).toBe('ALREADY_USED');
      expect(
        asMock(prisma.mobileVerificationToken.update),
      ).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      asMock(prisma.mobileVerificationToken.findUnique).mockResolvedValue(
        makeRecord({ expiresAt: new Date(Date.now() - 1) }),
      );

      const result = await service.consumeVerificationToken(
        CLIENT_ID,
        'raw-token',
      );

      expect(result.outcome).toBe('EXPIRED');
      expect(
        asMock(prisma.mobileVerificationToken.update),
      ).not.toHaveBeenCalled();
    });

    it('fails closed for another Client token (cross-Client isolation)', async () => {
      asMock(prisma.mobileVerificationToken.findUnique).mockResolvedValue(
        makeRecord({ clientId: OTHER_CLIENT_ID }),
      );

      const result = await service.consumeVerificationToken(
        CLIENT_ID,
        'raw-token',
      );

      expect(result.outcome).toBe('NOT_FOUND');
      expect(
        asMock(prisma.mobileVerificationToken.update),
      ).not.toHaveBeenCalled();
    });
  });
});