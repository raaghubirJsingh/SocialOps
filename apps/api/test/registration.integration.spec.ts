import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { EMAIL_VERIFICATION_PROVIDER, WHATSAPP_VERIFICATION_PROVIDER } from '../src/registration/providers/verification-provider.port.js';
import type { VerificationProvider } from '../src/registration/providers/verification-provider.port.js';
import { clearDevConsoleOutbox, readDevConsoleOutbox } from '../src/registration/providers/dev-console.provider.js';
import { ReminderService } from '../src/registration/reminder/reminder.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.constants.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Registration Phase v1.0 integration tests.
 *
 * Boots the REAL AppModule (global guards, DTO validation, Swagger
 * metadata, Redis rate limiting, Prisma) against the local PostgreSQL +
 * Memurai instances and drives the staged endpoints over HTTP. OTP codes
 * are read from the development Console Provider outbox (OPEN-4) - the
 * same in-process capture mechanism a developer uses locally; production
 * has no equivalent (no bypass exists).
 *
 * Coverage: staged lifecycle, dual-verification gate, OTP rules
 * (5-min/3-attempt/1-hour lock/3-resend/no-reset), provider
 * unavailability, canonical phone, duplicate pending (L6), explicit
 * duplicate-email message (L7), lazy expiry, Redis rate limits
 * (OPEN-3), token rotation at reminder events (D1-A - all 14 mandated
 * checks), reminder content safety, provisioning, and the legacy
 * registration retirement (L11).
 */

process.loadEnvFile();
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-reg-access-32-chars-min!';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-reg-refresh-32-chars!!';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';

const PASSWORD = 'StrongPassword123!';
const runTag = `reg-v1-${randomUUID()}`;
const testEmail = (name: string) => `regv1.${name}.${runTag}@example.test`;

let app: INestApplication;
let http: ReturnType<typeof request>;
let moduleRef: TestingModule;
let redis: Redis;

const baseStart = (name: string, overrides: Record<string, unknown> = {}) => ({
  fullName: `Reg User ${name}`,
  email: testEmail(name),
  phone: '9876543210',
  accountType: 'CLIENT',
  discoveryAnswers: { root: 'own', ownBranch: 'personal' },
  ...overrides,
});

/** Flush the five registration rate-limit buckets (fresh 15-min window). */
async function flushRateLimits(): Promise<void> {
  const keys = await redis.keys('rl:reg:*');
  if (keys.length > 0) await redis.del(...keys);
}

/** Latest dev-console OTP for a channel (development capture only). */
function latestOtp(channel: 'EMAIL' | 'WHATSAPP'): string {
  const outbox = readDevConsoleOutbox();
  for (let i = outbox.length - 1; i >= 0; i -= 1) {
    const entry = outbox[i];
    if (entry.channel !== channel) continue;
    const match = entry.message.body.match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  throw new Error(`no ${channel} OTP captured in the dev console outbox`);
}

async function startPending(
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<{ token: string; body: Record<string, unknown> }> {
  await flushRateLimits();
  clearDevConsoleOutbox();
  const res = await http
    .post('/api/auth/registration/start')
    .send(baseStart(name, overrides));
  expect(res.status).toBe(201);
  return { token: res.body.resumeToken as string, body: res.body as Record<string, unknown> };
}

async function verifyChannel(token: string, channel: 'EMAIL' | 'WHATSAPP') {
  const res = await http
    .post('/api/auth/registration/otp/verify')
    .send({ resumeToken: token, channel, otp: latestOtp(channel) });
  return res;
}

async function cleanup(): Promise<void> {
  await prisma.pendingRegistration.deleteMany({ where: { email: { contains: runTag } } });
  const users = await prisma.user.findMany({
    where: { email: { contains: runTag } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: { in: userIds } },
      select: { organizationId: true },
    });
    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
    await prisma.organizationMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    if (orgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

const prisma = new PrismaService();

const diagnosticClock = process.hrtime.bigint();

async function diagnosticPhase<T>(name: string, work: () => T | Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const elapsedStart = process.hrtime.bigint();
  process.stderr.write(
    `[registration-diagnostic] ${name} started at=${startedAt}\n`,
  );
  try {
    const result = await work();
    const durationMs = Number((process.hrtime.bigint() - elapsedStart) / 1_000_000n);
    process.stderr.write(
      `[registration-diagnostic] ${name} completed duration_ms=${durationMs}\n`,
    );
    return result;
  } catch (error) {
    const durationMs = Number((process.hrtime.bigint() - elapsedStart) / 1_000_000n);
    const errorType = error instanceof Error ? error.name : typeof error;
    process.stderr.write(
      `[registration-diagnostic] ${name} failed error_type=${errorType} duration_ms=${durationMs}\n`,
    );
    throw error;
  }
}

// This clock is retained only for the temporary diagnostic run; it is not used
// by application behavior or test assertions.
void diagnosticClock;

beforeAll(async () => {
  moduleRef = await diagnosticPhase('beforeAll.compile', () =>
    Test.createTestingModule({ imports: [AppModule] }).compile(),
  );
  app = await diagnosticPhase('beforeAll.createNestApplication', () =>
    moduleRef.createNestApplication(),
  );
  app.setGlobalPrefix('api');
  await diagnosticPhase('beforeAll.app.init', () => app.init());
  http = request(app.getHttpServer());
  redis = await diagnosticPhase('beforeAll.REDIS_CLIENT', () =>
    moduleRef.get<Redis>(REDIS_CLIENT),
  );
  await diagnosticPhase('beforeAll.prisma.$connect', () => prisma.$connect());
}, 60_000);

afterAll(async () => {
  await cleanup();
  await flushRateLimits();
  await app.close();
  await prisma.$disconnect();
});

describe('Registration Phase v1.0 (staged conversational registration)', () => {
  it('completes the full CLIENT journey: dual verification -> password -> login (no session before completion)', async () => {
    const { token, body } = await diagnosticPhase('firstTest.startPending', () =>
      startPending('happy'),
    );
    expect(body.status).toBe('pending_created');
    expect(body.maskedEmail).toContain('***@');
    expect(body.accountType).toBe('CLIENT');
    expect(body.emailVerified).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken/);

    // No User exists yet - registration starts as a PendingRegistration.
    expect(
      await diagnosticPhase('firstTest.userCountBeforeCompletion', () =>
        prisma.user.count({ where: { email: testEmail('happy') } }),
      ),
    ).toBe(0);

    // Password before ANY verification is refused (dual gate).
    const passwordBeforeVerification = await diagnosticPhase(
      'firstTest.passwordBeforeVerification',
      () =>
        http
          .post('/api/auth/registration/password')
          .send({ resumeToken: token, password: PASSWORD }),
    );
    expect(passwordBeforeVerification.status).toBe(403);

    const emailVerification = await diagnosticPhase('firstTest.verifyEmail', () =>
      verifyChannel(token, 'EMAIL'),
    );
    expect(emailVerification.status).toBe(200);

    // Email verified, WhatsApp not -> still refused.
    const passwordAfterEmailOnly = await diagnosticPhase(
      'firstTest.passwordAfterEmailOnly',
      () =>
        http
          .post('/api/auth/registration/password')
          .send({ resumeToken: token, password: PASSWORD }),
    );
    expect(passwordAfterEmailOnly.status).toBe(403);

    const whatsappVerification = await diagnosticPhase(
      'firstTest.verifyWhatsapp',
      () => verifyChannel(token, 'WHATSAPP'),
    );
    expect(whatsappVerification.status).toBe(200);
    expect(whatsappVerification.body.bothVerified).toBe(true);

    const done = await diagnosticPhase('firstTest.completeRegistration', () =>
      http
        .post('/api/auth/registration/password')
        .send({ resumeToken: token, password: PASSWORD }),
    );
    expect(done.status).toBe(201);
    expect(done.body).toEqual({ status: 'registration_complete' });
    expect(JSON.stringify(done.body)).not.toMatch(/accessToken|refreshToken/);

    const user = await diagnosticPhase('firstTest.readCompletedUser', () =>
      prisma.user.findUniqueOrThrow({
        where: { email: testEmail('happy') },
      }),
    );
    expect(user.isActive).toBe(true);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.phoneVerifiedAt).not.toBeNull(); // L9
    expect(user.accountType).toBe('CLIENT');
    expect(user.phone).toBe('+919876543210'); // OPEN-2 canonical
    expect(user.passwordHash?.startsWith('$argon2id$')).toBe(true);

    // PendingRegistration is gone; the current resume token died with it.
    expect(
      await diagnosticPhase('firstTest.pendingCountAfterCompletion', () =>
        prisma.pendingRegistration.count({ where: { email: testEmail('happy') } }),
      ),
    ).toBe(0);
    const resumeOldToken = await diagnosticPhase('firstTest.resumeOldToken', () =>
      http
        .post('/api/auth/registration/resume')
        .send({ resumeToken: token }),
    );
    expect(resumeOldToken.status).toBe(404);

    // Login works with the created password (unchanged login behavior).
    const login = await diagnosticPhase('firstTest.login', () =>
      http
        .post('/api/auth/login')
        .send({ email: testEmail('happy'), password: PASSWORD }),
    );
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
  });

  it('rejects an email that already belongs to a User with the explicit message (L7)', async () => {
    const { token } = await startPending('dup-user');
    await verifyChannel(token, 'EMAIL');
    await verifyChannel(token, 'WHATSAPP');
    await http
      .post('/api/auth/registration/password')
      .send({ resumeToken: token, password: PASSWORD });

    await flushRateLimits();
    const again = await http
      .post('/api/auth/registration/start')
      .send(baseStart('dup-user'));
    expect(again.status).toBe(403);
    expect(JSON.stringify(again.body)).toContain('Email already in use');
  });
  it('resumes an active pending for the same email without a second row or timer reset (L6)', async () => {
    const { token } = await startPending('dup-pending');
    const row1 = await prisma.pendingRegistration.findUniqueOrThrow({
      where: { email: testEmail('dup-pending') },
    });

    await flushRateLimits();
    clearDevConsoleOutbox();
    const resumed = await http.post('/api/auth/registration/start').send(
      baseStart('dup-pending', { resumeToken: token, fullName: 'Edited Name' }),
    );
    expect(resumed.status).toBe(201);
    expect(resumed.body.status).toBe('pending_resumed');
    expect(resumed.body.expiresAt).toBe(row1.expiresAt.toISOString()); // no timer reset
    expect(
      await prisma.pendingRegistration.count({
        where: { email: testEmail('dup-pending') },
      }),
    ).toBe(1);

    const newToken = resumed.body.resumeToken as string;
    expect(newToken).not.toBe(token); // credential rotated
    const row2 = await prisma.pendingRegistration.findUniqueOrThrow({
      where: { email: testEmail('dup-pending') },
    });
    expect(row2.createdAt.getTime()).toBe(row1.createdAt.getTime());
    expect(row2.expiresAt.getTime()).toBe(row1.expiresAt.getTime());
    expect(row2.fullName).toBe('Edited Name'); // pre-completion edit (OPEN-9)

    // Old token invalid; the new one works.
    expect(
      (
        await http
          .post('/api/auth/registration/resume')
          .send({ resumeToken: token })
      ).status,
    ).toBe(404);
    expect(
      (
        await http
          .post('/api/auth/registration/resume')
          .send({ resumeToken: newToken })
      ).status,
    ).toBe(200);
  });

  it('requires the CURRENT credential to resume an existing pending (no email-only handover)', async () => {
    await startPending('no-token');
    await flushRateLimits();
    const res = await http
      .post('/api/auth/registration/start')
      .send(baseStart('no-token'));
    expect(res.status).toBe(404); // uniform - no credential, no handover
  });

  it('rejects a stale token pointing at nothing (uniform 404)', async () => {
    const res = await http
      .post('/api/auth/registration/resume')
      .send({ resumeToken: 'rotated-away-token-value' });
    expect(res.status).toBe(404);
  });

  it('requires an explicit classification before completion (resume path, never guessed - L13)', async () => {
    const { token } = await startPending('no-class', { accountType: null });
    await verifyChannel(token, 'EMAIL');
    await verifyChannel(token, 'WHATSAPP');

    const withoutClass = await http
      .post('/api/auth/registration/password')
      .send({ resumeToken: token, password: PASSWORD });
    expect(withoutClass.status).toBe(403);
    expect(JSON.stringify(withoutClass.body)).toContain('Account type is required');

    const withClass = await http.post('/api/auth/registration/password').send({
      resumeToken: token,
      password: PASSWORD,
      accountType: 'SERVICE_PROVIDER', // the explicit forced choice
    });
    expect(withClass.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: testEmail('no-class') },
    });
    expect(user.accountType).toBe('SERVICE_PROVIDER');
  });

  it('normalizes approved phone shapes and rejects everything else (OPEN-2)', async () => {
    await flushRateLimits();
    const ok = await http.post('/api/auth/registration/start').send(
      baseStart('phone-ok', { phone: '+91 98765 43210' }),
    );
    expect(ok.status).toBe(201);
    const row = await prisma.pendingRegistration.findUniqueOrThrow({
      where: { email: testEmail('phone-ok') },
    });
    expect(row.phone).toBe('+919876543210');

    await flushRateLimits();
    const bad = await http
      .post('/api/auth/registration/start')
      .send(baseStart('phone-bad', { phone: '12345' }));
    expect(bad.status).toBe(400);
  });
  it('locks for 1 hour after 3 wrong attempts (registration survives) and preserves attempts across resends (L4/L5)', async () => {
    const { token } = await startPending('otp-lock');
    const wrong = () =>
      http
        .post('/api/auth/registration/otp/verify')
        .send({ resumeToken: token, channel: 'EMAIL', otp: '000000' });

    expect((await wrong()).status).toBe(403);
    // Resend must NOT reset the wrong-attempt count (L5).
    const resend = await http
      .post('/api/auth/registration/otp/resend')
      .send({ resumeToken: token, channel: 'EMAIL' });
    expect(resend.status).toBe(200);
    expect((await wrong()).status).toBe(403);
    const third = await wrong();
    expect(third.status).toBe(403);
    expect(JSON.stringify(third.body)).toContain('locked');
    expect(third.body.retryAfterSeconds).toBeGreaterThan(0);

    // The lock does NOT delete the registration.
    const row = await prisma.pendingRegistration.findUniqueOrThrow({
      where: { email: testEmail('otp-lock') },
    });
    expect(row.lockedUntil).not.toBeNull();
    // ... and resends are also blocked while locked.
    const lockedResend = await http
      .post('/api/auth/registration/otp/resend')
      .send({ resumeToken: token, channel: 'EMAIL' });
    expect(lockedResend.status).toBe(403);
  });

  it('caps SUCCESSFUL resends at 3 (OPEN-5)', async () => {
    const { token } = await startPending('otp-resend-cap');
    for (let i = 0; i < 3; i += 1) {
      const res = await http
        .post('/api/auth/registration/otp/resend')
        .send({ resumeToken: token, channel: 'EMAIL' });
      expect(res.status).toBe(200);
      expect(res.body.sendStatus).toBe('sent');
    }
    const fourth = await http
      .post('/api/auth/registration/otp/resend')
      .send({ resumeToken: token, channel: 'EMAIL' });
    expect(fourth.status).toBe(403);
    expect(JSON.stringify(fourth.body)).toContain('Resend limit reached');
  });

  it('never stores or returns the raw OTP (hash-only persistence, no bypass)', async () => {
    const { token } = await startPending('otp-hash');
    const code = latestOtp('EMAIL');
    const row = await prisma.registrationOtp.findFirstOrThrow({
      where: {
        pendingRegistration: { email: testEmail('otp-hash') },
        channel: 'EMAIL',
      },
    });
    expect(row.codeHash.startsWith('$argon2id$')).toBe(true);
    expect(row.codeHash).not.toBe(code);
    expect(row.attempts).toBe(0);
    expect(row.resendCount).toBe(0);

    const resume = await http
      .post('/api/auth/registration/resume')
      .send({ resumeToken: token });
    expect(JSON.stringify(resume.body)).not.toContain(code);
  });

  it('enforces the approved Redis rate limits (start 5/15min/IP) with 429 + Retry-After (OPEN-3/L15)', async () => {
    await flushRateLimits();
    for (let i = 0; i < 5; i += 1) {
      const res = await http
        .post('/api/auth/registration/start')
        .send(baseStart(`rl-${i}`));
      expect(res.status).toBe(201);
    }
    const sixth = await http
      .post('/api/auth/registration/start')
      .send(baseStart('rl-6'));
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
    await flushRateLimits();
  });
  describe('D1-A: reminder events rotate the SINGLE resume token', () => {
    const reminderService = () => moduleRef.get(ReminderService);
    const providers = () => ({
      email: moduleRef.get<VerificationProvider>(EMAIL_VERIFICATION_PROVIDER),
      whatsapp: moduleRef.get<VerificationProvider>(WHATSAPP_VERIFICATION_PROVIDER),
    });

    async function newPending(name: string): Promise<string> {
      const { token } = await startPending(name);
      return token;
    }
    async function rowOf(name: string) {
      return prisma.pendingRegistration.findUniqueOrThrow({
        where: { email: testEmail(name) },
      });
    }
    async function resumeStatus(token: string) {
      return (
        await http.post('/api/auth/registration/resume').send({ resumeToken: token })
      ).status;
    }

    it('1/2/3: /start token works before rotation; +24h rotation invalidates it; the new reminder token works', async () => {
      const token0 = await newPending('d1-day1');
      expect(await resumeStatus(token0)).toBe(200); // (1)
      const before = await rowOf('d1-day1');

      const day1 = await reminderService().processReminderEvent(before.id, 1);
      expect(day1.outcome).toBe('processed');
      expect(day1.rotated).toBe(true);
      const token1 = day1.rawToken as string;
      expect(token1).not.toBe(token0);

      expect(await resumeStatus(token0)).toBe(404); // (2) old token invalid
      expect(await resumeStatus(token1)).toBe(200); // (3) new token works
    });

    it('4/5: +48h and +66h rotations invalidate ALL previous tokens', async () => {
      const token0 = await newPending('d1-day2-3');
      const row = await rowOf('d1-day2-3');

      const day1 = await reminderService().processReminderEvent(row.id, 1);
      const token1 = day1.rawToken as string;
      const day2 = await reminderService().processReminderEvent(row.id, 2);
      expect(day2.rotated).toBe(true);
      const token2 = day2.rawToken as string;
      expect(await resumeStatus(token0)).toBe(404);
      expect(await resumeStatus(token1)).toBe(404); // (4)
      expect(await resumeStatus(token2)).toBe(200);

      const day3 = await reminderService().processReminderEvent(row.id, 3);
      expect(day3.rotated).toBe(true);
      const token3 = day3.rawToken as string;
      expect(await resumeStatus(token2)).toBe(404); // (5)
      expect(await resumeStatus(token3)).toBe(200); // (14) resume restores the flow
    });

    it('6/7: rotation NEVER modifies createdAt or expiresAt', async () => {
      await newPending('d1-timers');
      const before = await rowOf('d1-timers');
      await reminderService().processReminderEvent(before.id, 1);
      await reminderService().processReminderEvent(before.id, 2);
      await reminderService().processReminderEvent(before.id, 3);
      const after = await rowOf('d1-timers');
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
      expect(after.resumeTokenHash).not.toBe(before.resumeTokenHash);
    });
    it('8: duplicate processing of the same reminder event does NOT rotate again', async () => {
      const token0 = await newPending('d1-dedupe');
      const row = await rowOf('d1-dedupe');
      const first = await reminderService().processReminderEvent(row.id, 1);
      const hashAfterFirst = (await rowOf('d1-dedupe')).resumeTokenHash;

      const again = await reminderService().processReminderEvent(row.id, 1);
      expect(again.outcome).toBe('skipped');
      expect(again.reason).toBe('already_processed');
      expect(again.rotated).toBe(false);
      expect((await rowOf('d1-dedupe')).resumeTokenHash).toBe(hashAfterFirst);
      expect(await resumeStatus(first.rawToken as string)).toBe(200);
      expect(await resumeStatus(token0)).toBe(404);
    });

    it('9/10: provider failure causes NO extra rotation; a retry reuses the CURRENT token', async () => {
      const token0 = await newPending('d1-fail');
      const row = await rowOf('d1-fail');
      const { email } = providers();
      const failSpy = jest
        .spyOn(email, 'send')
        .mockRejectedValue(new Error('provider down'));

      const day1 = await reminderService().processReminderEvent(row.id, 1);
      expect(day1.outcome).toBe('processed');
      expect(day1.rotated).toBe(true);
      expect(day1.channels?.email.status).toBe('failed');
      expect(day1.channels?.whatsapp.status).toBe('sent'); // OPEN-6B independence
      const hashAfterRotation = (await rowOf('d1-fail')).resumeTokenHash;
      const currentToken = day1.rawToken as string;

      // Re-processing does not rotate again.
      const again = await reminderService().processReminderEvent(row.id, 1);
      expect(again.outcome).toBe('skipped');
      expect((await rowOf('d1-fail')).resumeTokenHash).toBe(hashAfterRotation);

      // Retry the FAILED channel with the CURRENT token: no rotation.
      failSpy.mockRestore();
      const retry = await reminderService().retryReminderChannel(
        row.id,
        1,
        'email',
        currentToken,
      );
      expect(retry.outcome).toBe('retried');
      expect(retry.channel?.status).toBe('sent');
      expect((await rowOf('d1-fail')).resumeTokenHash).toBe(hashAfterRotation);

      // A rotated-away token can never retry.
      const stale = await reminderService().retryReminderChannel(
        row.id,
        1,
        'email',
        token0,
      );
      expect(stale.outcome).toBe('skipped');
      expect(stale.reason).toBe('stale_token');
    });

    it('11/12: expired pending rejects the current token and later reads as not_found', async () => {
      const token0 = await newPending('d1-expired');
      const row = await rowOf('d1-expired');
      await prisma.pendingRegistration.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const expired = await reminderService().processReminderEvent(row.id, 1);
      expect(expired.outcome).toBe('skipped');
      expect(expired.reason).toBe('expired');
      expect(
        await prisma.pendingRegistration.count({ where: { id: row.id } }),
      ).toBe(0); // temp data deleted (OTP rows cascade)
      expect(await resumeStatus(token0)).toBe(404);
      expect(await reminderService().processReminderEvent(row.id, 1)).toEqual({
        outcome: 'skipped',
        reason: 'not_found',
        rotated: false,
      });
    });

    it('reminder messages carry the resume link and never OTP/password material', async () => {
      await newPending('d1-content');
      const row = await rowOf('d1-content');
      const otpCode = latestOtp('EMAIL');
      clearDevConsoleOutbox();

      const day3 = await reminderService().processReminderEvent(row.id, 3);
      expect(day3.outcome).toBe('processed');
      const entries = readDevConsoleOutbox();
      expect(entries.length).toBe(2); // Email + WhatsApp, independently sent
      for (const entry of entries) {
        expect(entry.message.body).toContain('/register/resume?token=');
        expect(entry.message.body).toContain(day3.rawToken as string);
        expect(entry.message.body).not.toContain(otpCode);
        expect(entry.message.body.toLowerCase()).not.toContain('password');
      }
    });
  });
  it('L14: an unavailable provider never bypasses verification (pending stays active, both verified required)', async () => {
    const emailProvider = moduleRef.get<VerificationProvider>(EMAIL_VERIFICATION_PROVIDER);
    const availSpy = jest.spyOn(emailProvider, 'isAvailable').mockReturnValue(false);
    const { token, body } = await startPending('provider-down');
    const sendStatus = body.sendStatus as { email: string; whatsapp: string };
    expect(sendStatus.email).toBe('unavailable');
    expect(sendStatus.whatsapp).toBe('sent');
    availSpy.mockRestore();

    // WhatsApp alone cannot complete: the email half stays mandatory.
    expect((await verifyChannel(token, 'WHATSAPP')).status).toBe(200);
    const blocked = await http
      .post('/api/auth/registration/password')
      .send({ resumeToken: token, password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(JSON.stringify(blocked.body)).toContain('Both verifications must be completed');

    // Later retry of the email channel works: no bypass, no quota abuse.
    const resend = await http
      .post('/api/auth/registration/otp/resend')
      .send({ resumeToken: token, channel: 'EMAIL' });
    expect(resend.status).toBe(200);
    expect(resend.body.sendStatus).toBe('sent');
    expect((await verifyChannel(token, 'EMAIL')).status).toBe(200);
    expect(
      (
        await http
          .post('/api/auth/registration/password')
          .send({ resumeToken: token, password: PASSWORD })
      ).status,
    ).toBe(201);
  });

  it('provisions an Organization + OWNER membership only for SERVICE_PROVIDER (CLIENT gets none)', async () => {
    const sp = await startPending('sp-prov', { accountType: 'SERVICE_PROVIDER' });
    await verifyChannel(sp.token, 'EMAIL');
    await verifyChannel(sp.token, 'WHATSAPP');
    await http
      .post('/api/auth/registration/password')
      .send({ resumeToken: sp.token, password: PASSWORD });

    const spUser = await prisma.user.findUniqueOrThrow({
      where: { email: testEmail('sp-prov') },
    });
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: spUser.id },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('OWNER');

    // CLIENT (the happy-path user) receives no tenant.
    const clientUser = await prisma.user.findUniqueOrThrow({
      where: { email: testEmail('happy') },
    });
    expect(
      await prisma.organizationMembership.count({ where: { userId: clientUser.id } }),
    ).toBe(0);
  });

  it('L11 + OPEN-9: legacy route is gone and NO endpoint mutates User profile/email', async () => {
    const legacy = await http
      .post('/api/auth/register')
      .send({ email: testEmail('legacy'), password: PASSWORD });
    expect(legacy.status).toBe(404);

    // Route-surface guard: no user/profile mutation endpoints exist at
    // all, so User.email is structurally immutable.
    expect((await http.patch('/api/users/me').send({ email: 'x@y.test' })).status).toBe(404);
    expect((await http.put('/api/users/me').send({ email: 'x@y.test' })).status).toBe(404);
    expect((await http.get('/api/users/me')).status).toBe(404);
    expect((await http.patch('/api/auth/registration/password').send({})).status).toBe(404);
    expect((await http.put('/api/auth/registration/start').send({})).status).toBe(404);
  });

  it('structural (D1-A): PendingRegistration exposes exactly ONE credential field', () => {
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === 'PendingRegistration',
    );
    expect(model).toBeDefined();
    const names = model!.fields.map((f) => f.name).sort();
    expect(names).toEqual([
      'accountType',
      'createdAt',
      'discoveryAnswers',
      'email',
      'emailVerifiedAt',
      'expiresAt',
      'fullName',
      'id',
      'lockedUntil',
      'otps',
      'phone',
      'reminderState',
      'resumeTokenHash',
      'updatedAt',
      'whatsappVerifiedAt',
    ]);
    expect(names).not.toContain('registrationRefHash');
    const credentialLike = names.filter((n) => /token|secret|credential|key/i.test(n));
    expect(credentialLike).toEqual(['resumeTokenHash']);
  });
});

