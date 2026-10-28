import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { AdminStepUpService } from './admin-step-up.service.js';
import {
  ADMIN_STEP_UP_ERROR_CODES,
  ADMIN_STEP_UP_LOCK_MINUTES,
  ADMIN_STEP_UP_MAX_RESENDS,
  ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS,
  ADMIN_STEP_UP_SESSION_TTL_MINUTES,
  ADMIN_STEP_UP_TTL_MINUTES,
} from './constants/admin.constants.js';

const TEST_USER_ID = 'user-123';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Prisma mock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function makePrismaMock() {
  const prisma = {
    adminStepUpChallenge: {
      upsert: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
      findUnique: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
      updateMany: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
    },
    adminStepUpSession: {
      create: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
      findUnique: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
      updateMany: jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>,
    },
    $transaction: jest.fn() as jest.MockedFunction<(cb: (tx: any) => Promise<unknown>) => Promise<unknown>>,
  };
  prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  return prisma;
}

function makeService() {
  const prisma = makePrismaMock() as ReturnType<typeof makePrismaMock>;
  const service = new AdminStepUpService(prisma as any);
  return { service, prisma };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function makeChallengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'challenge-1',
    userId: TEST_USER_ID,
    channel: 'EMAIL' as const,
    codeHash: 'fake-hash',
    expiresAt: new Date(Date.now() + ADMIN_STEP_UP_TTL_MINUTES * 60_000),
    usedAt: null,
    attempts: 0,
    resendCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

describe('AdminStepUpService', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ issueChallenge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('issueChallenge', () => {
    it('rejects non-EMAIL channels with ForbiddenException', async () => {
      const { service } = makeService();
      await expect(
        service.issueChallenge({ id: TEST_USER_ID }, 'SMS' as never, {
          resetAttempts: false,
          countResend: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a new challenge row on first issue', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('123456');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('hashed-otp');
      const row = makeChallengeRow({ codeHash: 'hashed-otp' });
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(row);

      const result = await service.issueChallenge(
        { id: TEST_USER_ID }, 'EMAIL',
        { resetAttempts: false, countResend: false },
      );

      expect(result).toEqual({ sendStatus: 'sent' });
      const call = prisma.adminStepUpChallenge.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ userId: TEST_USER_ID });
      expect(call.create).toMatchObject({
        userId: TEST_USER_ID, channel: 'EMAIL',
        codeHash: 'hashed-otp', attempts: 0, resendCount: 0,
      });
      expect(call.update).toMatchObject({ codeHash: 'hashed-otp', usedAt: null });
      expect(prisma.adminStepUpChallenge.updateMany).not.toHaveBeenCalled();
    });

    it('resets attempts when resetAttempts is true', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('999999');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('new-hash');
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(
        makeChallengeRow({ codeHash: 'new-hash' }),
      );

      await service.issueChallenge({ id: TEST_USER_ID }, 'EMAIL', {
        resetAttempts: true, countResend: false,
      });

      const call = prisma.adminStepUpChallenge.upsert.mock.calls[0][0];
      expect(call.update).toMatchObject({ codeHash: 'new-hash', usedAt: null, attempts: 0 });
    });

    it('consumes resend quota when countResend is true', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('111111');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('sent-hash');
      const row = makeChallengeRow({ codeHash: 'sent-hash', id: 'ch-1' });
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(row);
      prisma.adminStepUpChallenge.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.issueChallenge(
        { id: TEST_USER_ID }, 'EMAIL',
        { resetAttempts: false, countResend: true },
      );

      expect(result).toEqual({ sendStatus: 'sent' });
      expect(prisma.adminStepUpChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: 'ch-1', resendCount: { lt: ADMIN_STEP_UP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
    });

    it('throws OTP_RESEND_LIMIT when quota slot cannot be reserved', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('222222');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('sent-hash');
      const row = makeChallengeRow({ codeHash: 'sent-hash', id: 'ch-2' });
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(row);
      prisma.adminStepUpChallenge.updateMany.mockResolvedValue({ count: 0 });

      try {
        await service.issueChallenge({ id: TEST_USER_ID }, 'EMAIL', {
          resetAttempts: false, countResend: true,
        });
        throw new Error('Expected ForbiddenException to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        const resp = (e as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(resp.code).toBe(ADMIN_STEP_UP_ERROR_CODES.OTP_RESEND_LIMIT);
      }
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ verify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('verify', () => {
    it('returns invalid for non-EMAIL channels', async () => {
      const { service } = makeService();
      const result = await service.verify(TEST_USER_ID, 'SMS' as never, '123456');
      expect(result).toEqual({ outcome: 'invalid' });
    });

    it('returns invalid when no challenge exists', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(null);
      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result).toEqual({ outcome: 'invalid' });
    });

    it('returns invalid when challenge is already used', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ usedAt: new Date() }),
      );
      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result).toEqual({ outcome: 'invalid' });
    });

    it('returns invalid when challenge is expired', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result).toEqual({ outcome: 'invalid' });
    });

    it('returns locked with retryAfterSeconds when challenge is locked', async () => {
      const { service, prisma } = makeService();
      const lockedUntil = new Date(Date.now() + 120_000);
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ lockedUntil }),
      );

      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result.outcome).toBe('locked');
      const secs = (result as { retryAfterSeconds: number }).retryAfterSeconds;
      expect(secs).toBeGreaterThanOrEqual(118);
      expect(secs).toBeLessThanOrEqual(122);
    });

    it('returns verified and marks usedAt on correct OTP', async () => {
      const { service, prisma } = makeService();
      const row = makeChallengeRow();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(row);
      jest.spyOn(service as any, 'safeVerifyOtp').mockResolvedValue(true);
      prisma.adminStepUpChallenge.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result).toEqual({ outcome: 'verified' });
      expect(prisma.adminStepUpChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: row.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('returns invalid on wrong OTP below threshold', async () => {
      const { service, prisma } = makeService();
      const row = makeChallengeRow({ attempts: 0 });
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(row);
      jest.spyOn(service as any, 'safeVerifyOtp').mockResolvedValue(false);
      prisma.adminStepUpChallenge.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.verify(TEST_USER_ID, 'EMAIL', 'wrong');
      expect(result).toEqual({ outcome: 'invalid' });
      expect(prisma.adminStepUpChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: row.id, attempts: { lt: ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS - 1 } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('returns locked with retryAfterSeconds=60 on 3rd wrong attempt', async () => {
      const { service, prisma } = makeService();
      const row = makeChallengeRow({ attempts: ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS - 1 });
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(row);
      jest.spyOn(service as any, 'safeVerifyOtp').mockResolvedValue(false);

      const updateMany = prisma.adminStepUpChallenge.updateMany;
      updateMany.mockResolvedValueOnce({ count: 0 });
      updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.verify(TEST_USER_ID, 'EMAIL', '123456');
      expect(result.outcome).toBe('locked');
      expect((result as { retryAfterSeconds: number }).retryAfterSeconds).toBe(
        ADMIN_STEP_UP_LOCK_MINUTES * 60,
      );
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: row.id },
        data: {
          attempts: ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS,
          lockedUntil: expect.any(Date),
        },
      });
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ createSession â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('createSession', () => {
    it('hashes session token with SHA-256 and stores with 15-min expiry', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateSessionToken').mockReturnValue('raw-token-xyz');

      let capturedCreateArg: any = null;
      prisma.adminStepUpSession.create.mockImplementation(
        async (arg: unknown) => {
          capturedCreateArg = arg;
          return makeChallengeRow();
        },
      );

      const sessionToken = await service.createSession(TEST_USER_ID);

      expect(sessionToken).toBe('raw-token-xyz');
      const data = capturedCreateArg.data;
      expect(data.userId).toBe(TEST_USER_ID);
      expect(data.sessionTokenHash).not.toBe('raw-token-xyz');
      expect(data.sessionTokenHash).toMatch(/^[0-9a-f]{64}$/);
      const ttl = (data.expiresAt as Date).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(ADMIN_STEP_UP_SESSION_TTL_MINUTES * 60_000 - 1_000);
      expect(ttl).toBeLessThan(ADMIN_STEP_UP_SESSION_TTL_MINUTES * 60_000 + 1_000);
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ resend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('resend', () => {
    it('rejects non-EMAIL channels with ForbiddenException', async () => {
      const { service } = makeService();
      await expect(service.resend(TEST_USER_ID, 'SMS' as never)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('seeds a new challenge when no existing challenge is found', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('333333');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('seed-hash');

      const findUnique = prisma.adminStepUpChallenge.findUnique;
      findUnique.mockResolvedValueOnce(null);
      findUnique.mockResolvedValueOnce(makeChallengeRow({ resendCount: 1 }));
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(
        makeChallengeRow({ codeHash: 'seed-hash' }),
      );

      const result = await service.resend(TEST_USER_ID, 'EMAIL');
      expect(result.sendStatus).toBe('sent');
      expect(result.resendRemaining).toBe(ADMIN_STEP_UP_MAX_RESENDS - 1);
    });

    it('throws OTP_LOCKED with ~60s retryAfterSeconds when locked', async () => {
      const { service, prisma } = makeService();
      const lockedUntil = new Date(Date.now() + 60_000);
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ lockedUntil }),
      );

      try {
        await service.resend(TEST_USER_ID, 'EMAIL');
        throw new Error('Expected ForbiddenException to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        const resp = (e as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(resp.code).toBe(ADMIN_STEP_UP_ERROR_CODES.OTP_LOCKED);
        // Verify the dynamically calculated retry value (~60s).
        expect(resp.retryAfterSeconds).toBeGreaterThanOrEqual(55);
        expect(resp.retryAfterSeconds).toBeLessThanOrEqual(65);
      }
    });

    it('throws OTP_RESEND_LIMIT when resend quota is exhausted', async () => {
      const { service, prisma } = makeService();
      const row = makeChallengeRow({ resendCount: ADMIN_STEP_UP_MAX_RESENDS });
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(row);

      try {
        await service.resend(TEST_USER_ID, 'EMAIL');
        throw new Error('Expected ForbiddenException to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        const resp = (e as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(resp.code).toBe(ADMIN_STEP_UP_ERROR_CODES.OTP_RESEND_LIMIT);
      }
    });

    it('reserves slot atomically and returns remaining quota', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('444444');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('new-code-hash');

      const row = makeChallengeRow({ resendCount: 1 });
      const findUnique = prisma.adminStepUpChallenge.findUnique;
      findUnique.mockResolvedValueOnce(row);
      findUnique.mockResolvedValueOnce(row);

      const updateMany = prisma.adminStepUpChallenge.updateMany;
      updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(
        makeChallengeRow({ id: 'ch-3', resendCount: 2 }),
      );
      findUnique.mockResolvedValueOnce(makeChallengeRow({ resendCount: 2 }));

      const result = await service.resend(TEST_USER_ID, 'EMAIL');
      expect(result.sendStatus).toBe('sent');
      expect(result.resendRemaining).toBe(ADMIN_STEP_UP_MAX_RESENDS - 2);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: row.id, resendCount: { lt: ADMIN_STEP_UP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
    });

    it('does not refund reservation when dispatch succeeds', async () => {
      const { service, prisma } = makeService();
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('555555');
      jest.spyOn(service as any, 'hashOtp').mockResolvedValue('ok-hash');

      const row = makeChallengeRow({ resendCount: 0 });
      const findUnique = prisma.adminStepUpChallenge.findUnique;
      findUnique.mockResolvedValueOnce(row);
      findUnique.mockResolvedValueOnce({ ...row, resendCount: 0 });
      prisma.adminStepUpChallenge.upsert.mockResolvedValue(
        makeChallengeRow({ id: 'ch-4', resendCount: 1 }),
      );
      findUnique.mockResolvedValueOnce(makeChallengeRow({ resendCount: 1 }));

      const updateMany = prisma.adminStepUpChallenge.updateMany;
      updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.resend(TEST_USER_ID, 'EMAIL');
      expect(result.sendStatus).toBe('sent');
      expect(updateMany).toHaveBeenCalledTimes(1); // only reservation, no refund
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ resendRemaining â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('resendRemaining', () => {
    it('returns 0 for non-EMAIL channels', async () => {
      const { service, prisma } = makeService();
      const result = await service.resendRemaining(TEST_USER_ID, 'SMS' as never);
      expect(result).toBe(0);
      expect(prisma.adminStepUpChallenge.findUnique).not.toHaveBeenCalled();
    });

    it('returns full quota when no challenge exists', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(null);
      const result = await service.resendRemaining(TEST_USER_ID, 'EMAIL');
      expect(result).toBe(ADMIN_STEP_UP_MAX_RESENDS);
    });

    it('returns correct remaining count', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ resendCount: 1 }),
      );
      const result = await service.resendRemaining(TEST_USER_ID, 'EMAIL');
      expect(result).toBe(ADMIN_STEP_UP_MAX_RESENDS - 1);
    });

    it('never goes below zero', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpChallenge.findUnique.mockResolvedValue(
        makeChallengeRow({ resendCount: ADMIN_STEP_UP_MAX_RESENDS + 5 }),
      );
      const result = await service.resendRemaining(TEST_USER_ID, 'EMAIL');
      expect(result).toBe(0);
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ revokeAllSessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('revokeAllSessions', () => {
    it('revokes all active sessions for a user', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeAllSessions(TEST_USER_ID);
      expect(result).toBe(3);
      expect(prisma.adminStepUpSession.updateMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('returns 0 when no sessions are active', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.revokeAllSessions(TEST_USER_ID);
      expect(result).toBe(0);
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ validateSession â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('validateSession', () => {
    it('returns null when no session matches the token hash', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('token');
      expect(result).toBeNull();
    });

    it('returns userId for a valid, un-consumed, un-revoked, un-expired session', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: TEST_USER_ID,
        sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await service.validateSession('token');
      expect(result).toEqual({ userId: TEST_USER_ID });
    });

    it('returns null for a consumed session', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-2', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(), revokedAt: null, createdAt: new Date(),
      });

      expect(await service.validateSession('token')).toBeNull();
    });

    it('returns null for a revoked session', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-3', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null, revokedAt: new Date(), createdAt: new Date(),
      });

      expect(await service.validateSession('token')).toBeNull();
    });

    it('returns null for an expired session', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-4', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null, revokedAt: null, createdAt: new Date(),
      });

      expect(await service.validateSession('token')).toBeNull();
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ consumeSession â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  describe('consumeSession', () => {
    it('returns null when no session matches', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue(null);

      expect(await service.consumeSession('token')).toBeNull();
    });

    it('consumes a valid session and returns userId', async () => {
      const { service, prisma } = makeService();
      const session = {
        id: 'sess-5', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null, revokedAt: null, createdAt: new Date(),
      };
      prisma.adminStepUpSession.findUnique.mockResolvedValue(session);
      prisma.adminStepUpSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.consumeSession('token');
      expect(result).toEqual({ userId: TEST_USER_ID });
      expect(prisma.adminStepUpSession.updateMany).toHaveBeenCalledWith({
        where: { id: session.id, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('returns null when concurrent consume race loses', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-6', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null, revokedAt: null, createdAt: new Date(),
      });
      prisma.adminStepUpSession.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.consumeSession('token')).toBeNull();
    });

    it('returns null for an expired session without calling updateMany', async () => {
      const { service, prisma } = makeService();
      prisma.adminStepUpSession.findUnique.mockResolvedValue({
        id: 'sess-7', userId: TEST_USER_ID, sessionTokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null, revokedAt: null, createdAt: new Date(),
      });

      expect(await service.consumeSession('token')).toBeNull();
      expect(prisma.adminStepUpSession.updateMany).not.toHaveBeenCalled();
    });
  });
});

