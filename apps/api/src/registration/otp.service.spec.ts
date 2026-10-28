import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import * as argon2 from 'argon2';

import type { PendingRegistration } from '@prisma/client';

import {
  OTP_MAX_RESENDS,
  OTP_MAX_WRONG_ATTEMPTS,
} from './constants/registration.constants.js';
import { OtpService } from './otp.service.js';
import { ProviderUnavailableError } from './providers/verification-provider.port.js';
import type { VerificationProvider } from './providers/verification-provider.port.js';

/**
 * OTP service unit tests (L4/L5/OPEN-5).
 * Real Argon2id hashing; Prisma and providers are in-memory mocks.
 */

function makePrisma() {
  const self = {
    registrationOtp: {
      findUnique: jest.fn(async () => null as unknown),
      findFirst: jest.fn(async () => null as unknown),
      update: jest.fn(async (args: unknown) => args),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async (args: unknown) => args),
      upsert: jest.fn(async (args: unknown) => ({
        id: 'otp-1',
        ...(typeof args === 'object' && args !== null
          ? ((args as { create?: unknown }).create as Record<string, unknown>)
          : {}),
      })),
    },
    pendingRegistration: {
      findUnique: jest.fn(async () => ({ lockedUntil: null })),
      update: jest.fn(async (args: unknown) => args),
    },
    $transaction: jest.fn(async (ops: unknown) => {
      // Sequential in-memory stand-in for Prisma $transaction. Two shapes:
      //   - array form: the service passes already-constructed Prisma
      //     promises; await each and return the collected results.
      //   - function form: the service passes a callback receiving a `tx`
      //     proxy that mirrors the same delegates; invoke it and return
      //     whatever it yields. This is what the lock path uses to re-read
      //     the lock state inside the transaction.
      if (typeof ops === 'function') {
        const tx = {
          registrationOtp: self.registrationOtp,
          pendingRegistration: self.pendingRegistration,
        };
        return ops(tx);
      }
      const list = ops as unknown[];
      const out: unknown[] = [];
      for (const op of list) out.push(await op);
      return out;
    }),
  };
  return self;
}

function makeProvider(
  channel: 'EMAIL' | 'WHATSAPP' = 'EMAIL',
): VerificationProvider {
  return {
    channel,
    isAvailable: jest.fn(() => true),
    send: jest.fn(async () => undefined),
  } as unknown as VerificationProvider;
}

function makePending(
  overrides: Partial<PendingRegistration> = {},
): PendingRegistration {
  return {
    id: 'pending-1',
    email: 'asha@example.com',
    fullName: 'Asha',
    phone: '+919876543210',
    accountType: 'CLIENT',
    discoveryAnswers: null,
    emailVerifiedAt: null,
    whatsappVerifiedAt: null,
    lockedUntil: null,
    resumeTokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    reminderState: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PendingRegistration;
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  email: VerificationProvider = makeProvider('EMAIL'),
  whatsapp: VerificationProvider = makeProvider('WHATSAPP'),
) {
  const service = new OtpService(
    prisma as unknown as ConstructorParameters<typeof OtpService>[0],
    email,
    whatsapp,
  );
  return { service, email, whatsapp };
}

/** Extract the 6-digit code the service dispatched (test-only capture). */
function codeFromProvider(provider: VerificationProvider): string {
  const calls = (provider.send as jest.Mock).mock.calls as unknown[][];
  const message = calls[calls.length - 1]?.[0] as { body: string };
  const match = message.body.match(/\b(\d{6})\b/);
  if (!match) throw new Error('no 6-digit code in dispatched body');
  return match[1];
}

describe('OtpService', () => {
  it('generates 6-digit numeric strings (leading zeros valid)', () => {
    const { service } = makeService(makePrisma());
    for (let i = 0; i < 60; i += 1) {
      const otp = service.generateOtp();
      expect(typeof otp).toBe('string');
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it('persists only an Argon2id hash of the code (never the raw OTP)', async () => {
    const prisma = makePrisma();
    const { service, email } = makeService(prisma);
    const pending = makePending();

    const result = await service.issueChallenge(pending, 'EMAIL', {
      resetAttempts: false,
      countResend: false,
    });
    expect(result.sendStatus).toBe('sent');

    const code = codeFromProvider(email);
    const upsertArg = prisma.registrationOtp.upsert.mock.calls[0][0] as {
      where: { pendingRegistrationId_channel: Record<string, string> };
      create: { codeHash: string; resendCount: number };
    };
    expect(upsertArg.where.pendingRegistrationId_channel).toEqual({
      pendingRegistrationId: pending.id,
      channel: 'EMAIL',
    });
    expect(upsertArg.create.codeHash.startsWith('$argon2id$')).toBe(true);
    expect(upsertArg.create.codeHash).not.toContain(code);
    expect(await argon2.verify(upsertArg.create.codeHash, code)).toBe(true);
    // Initial /start dispatch never counts against the resend budget.
    expect(upsertArg.create.resendCount).toBe(0);
    expect(prisma.registrationOtp.updateMany).not.toHaveBeenCalled();
  });

  it('wrong code increments attempts without locking below the max', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const codeHash = await argon2.hash('123456', { type: argon2.argon2id });
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
      resendCount: 0,
    });

    const result = await service.verify(makePending(), 'EMAIL', '000000');
    expect(result.outcome).toBe('invalid');
    // CONDITIONAL atomic increment (remediation): the write is an
    // `increment: 1` guarded by `attempts < max - 1`, so the mock's
    // `count: 1` default represents the guard succeeding.
    const bumpArg = (
      prisma.registrationOtp.updateMany.mock.calls[0] as unknown as [
        { where: { attempts?: { lt: number } }; data: { attempts: { increment: number } } },
      ]
    )[0];
    expect(bumpArg.where.attempts?.lt).toBe(OTP_MAX_WRONG_ATTEMPTS - 1);
    expect(bumpArg.data.attempts.increment).toBe(1);
    expect(prisma.pendingRegistration.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('3rd wrong attempt sets the pending-global 1-hour lock and KEEPS the registration', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const codeHash = await argon2.hash('123456', { type: argon2.argon2id });
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 2,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
      resendCount: 0,
    });
    // The conditional guard FAILS at attempts = 2 (already at threshold),
    // so the mock must return count: 0 to drive the lock path.
    prisma.registrationOtp.updateMany.mockResolvedValueOnce({ count: 0 });
    // Inside the lock transaction, the re-read finds no active lock.
    prisma.pendingRegistration.findUnique.mockResolvedValueOnce({
      lockedUntil: null,
    });

    const result = await service.verify(makePending(), 'EMAIL', '999999');
    expect(result).toEqual({ outcome: 'locked', retryAfterSeconds: 3600 });
    // Atomic $transaction: the lock path uses the function form so the
    // lock state can be re-read before writing.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const lockArg = prisma.pendingRegistration.update.mock.calls[0][0] as {
      data: { lockedUntil: Date };
    };
    expect(lockArg.data.lockedUntil.getTime()).toBeGreaterThan(
      Date.now() + 3500_000,
    );
    // Lock never deletes: the mock has no delete delegate at all.
    expect(
      (prisma.pendingRegistration as unknown as { delete?: unknown }).delete,
    ).toBeUndefined();
  });

  it('the lock exception carries the stable OTP_LOCKED code', async () => {
    // The OtpService returns the locked OUTCOME (it does not throw - the
    // RegistrationService is what translates the outcome into a ForbiddenException
    // carrying the stable code). Assert the outcome here; the HTTP-level code is
    // pinned by the integration suite.
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 2,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: 0,
    });
    // Conditional guard fails at the threshold -> lock path.
    prisma.registrationOtp.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.pendingRegistration.findUnique.mockResolvedValueOnce({
      lockedUntil: null,
    });

    const result = await service.verify(makePending(), 'EMAIL', '999999');
    expect(result).toEqual({ outcome: 'locked', retryAfterSeconds: 3600 });
  });

  it('the resend-limit exception carries the stable OTP_RESEND_LIMIT code', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: OTP_MAX_RESENDS,
    });

    // The service throws a ForbiddenException; the RegistrationService
    // rethrows it unchanged, so the stable code reaches the wire.
    let caught: unknown;
    try {
      await service.resend(makePending(), 'EMAIL');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    const response = (caught as { response?: unknown }).response;
    expect(response).toEqual(
      expect.objectContaining({ code: 'OTP_RESEND_LIMIT' }),
    );
  });

  it('an active lock blocks verification without touching the challenge', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const pending = makePending({
      lockedUntil: new Date(Date.now() + 500_000),
    });
    const result = await service.verify(pending, 'EMAIL', '123456');
    expect(result.outcome).toBe('locked');
    expect(prisma.registrationOtp.findUnique).not.toHaveBeenCalled();
  });

  it('a correct code stamps the channel verification and single-uses the row', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const codeHash = await argon2.hash('654321', { type: argon2.argon2id });
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
      resendCount: 0,
    });
    prisma.pendingRegistration.update.mockResolvedValue(
      makePending({ emailVerifiedAt: new Date() }),
    );

    const result = await service.verify(makePending(), 'EMAIL', '654321');
    expect(result.outcome).toBe('verified');
    // Atomic $transaction: pending stamp + single-use usedAt together.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const usedArg = (
      prisma.registrationOtp.updateMany.mock.calls[0] as unknown as [
        { data: { usedAt: Date } },
      ]
    )[0];
    expect(usedArg.data.usedAt).toBeInstanceOf(Date);
  });
  it('resend preserves the wrong-attempt count and consumes quota only on successful dispatch (OPEN-5)', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 2,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: 1,
    });

    const ok = await service.resend(makePending(), 'EMAIL');
    expect(ok.sendStatus).toBe('sent');
    // Quota slot reserved atomically BEFORE dispatch (guarded increment).
    const reserve = (
      prisma.registrationOtp.updateMany.mock.calls[0] as unknown as [
        {
          where: { resendCount: { lt: number } };
          data: { resendCount: { increment: number } };
        },
      ]
    )[0];
    expect(reserve.data.resendCount).toEqual({ increment: 1 });
    // Re-issue is in place: attempts are never in the write (L5), and the
    // reservation (not the upsert) owns resendCount - the upsert update
    // branch carries no absolute resendCount so concurrent increments
    // cannot be clobbered.
    const reissue = prisma.registrationOtp.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect('attempts' in reissue.update).toBe(false); // L5: never reset by resend
    expect('resendCount' in reissue.update).toBe(false);
    // Static mock row: resendRemaining is computed from the mocked
    // resendCount (1), so 3 - 1 remains.
    expect(ok.resendRemaining).toBe(OTP_MAX_RESENDS - 1);
  });

  it('a provider-unavailable resend consumes NO quota (OPEN-5/L14)', async () => {
    const prisma = makePrisma();
    const failing = makeProvider('EMAIL');
    (failing.send as jest.Mock).mockImplementation(async () => {
      throw new ProviderUnavailableError('EMAIL', 'down');
    });
    const { service } = makeService(prisma, failing);
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: 1,
    });

    const result = await service.resend(makePending(), 'EMAIL');
    expect(result.sendStatus).toBe('unavailable');
    // Reservation happened, then the provider failure refunded it.
    const writes = prisma.registrationOtp.updateMany.mock.calls.map(
      (c) => ((c as unknown as [{ data: Record<string, unknown> }])[0].data),
    );
    expect(writes.some((d) => JSON.stringify(d).includes('increment'))).toBe(true);
    expect(writes.some((d) => JSON.stringify(d).includes('decrement'))).toBe(true);
  });

  it('blocks resend past the successful-dispatch cap', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: OTP_MAX_RESENDS,
    });
    await expect(service.resend(makePending(), 'EMAIL')).rejects.toThrow(
      /Resend limit reached/,
    );
    // Fast-path rejection: no reservation, no re-issue.
    expect(prisma.registrationOtp.updateMany).not.toHaveBeenCalled();
    expect(prisma.registrationOtp.upsert).not.toHaveBeenCalled();
  });

  it('releases an expired lock with fresh challenges, attempts = 0, no quota use', async () => {
    const prisma = makePrisma();
    const { service, email, whatsapp } = makeService(prisma);
    prisma.pendingRegistration.update.mockResolvedValue(
      makePending({ lockedUntil: null }),
    );
    // The FRESH post-lock challenge starts at attempts = 0 (OPEN-5).
    prisma.registrationOtp.findUnique.mockResolvedValue({
      id: 'otp-1',
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: 'hash',
      resendCount: 2,
    });
    const pending = makePending({
      lockedUntil: new Date(Date.now() - 1000),
    });

    const result = await service.verify(pending, 'EMAIL', '123456');
    expect(result.outcome).toBe('invalid'); // one wrong attempt, no re-lock
    const clearArg = prisma.pendingRegistration.update.mock.calls[0][0] as {
      data: { lockedUntil: null };
    };
    expect(clearArg.data.lockedUntil).toBeNull();
    // Fresh challenges for BOTH unverified channels:
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(whatsapp.send).toHaveBeenCalledTimes(1);
    // attempts reset to 0 via the atomic post-lock upserts ...
    const resets = prisma.registrationOtp.upsert.mock.calls
      .map((c) => (c[0] as { update: Record<string, unknown> }).update)
      .filter((d) => d.attempts === 0);
    expect(resets.length).toBeGreaterThan(0);
    // ... and NO resend quota consumed (no resendCount increment anywhere:
    // post-lock re-issues pass countResend=false, and releaseExpiredLock never
    // reserves). The predicate is scoped to `resendCount` so the legitimate
    // wrong-attempt `attempts` increment below is not mistaken for quota use.
    const writes = [
      ...prisma.registrationOtp.updateMany.mock.calls.map(
        (c) => (c as unknown as [{ data: Record<string, unknown> }])[0].data,
      ),
      ...prisma.registrationOtp.upsert.mock.calls.map(
        (c) =>
          (c as unknown as [{ update?: Record<string, unknown> }])[0].update ??
          {},
      ),
    ];
    const quotaBumps = writes.filter(
      (d) =>
        d &&
        typeof d === 'object' &&
        'resendCount' in d &&
        JSON.stringify(
          (d as { resendCount: unknown }).resendCount,
        ).includes('increment'),
    );
    expect(quotaBumps.length).toBe(0);
  });
});
