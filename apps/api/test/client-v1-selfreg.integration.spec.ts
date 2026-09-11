/**
 * Client V1 ACT-2 L1 self-registration HTTP hardening (TESTS ONLY).
 */
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cv1e-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cv1e-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
const prisma = new PrismaClient();
const runTag = `cv1e-${randomUUID()}`;
const testEmail = (n: string) => `cv1e.${n}.${runTag}@example.test`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

async function registerLogin(accountType: 'INDIVIDUAL_BUSINESS' | 'SERVICE_PROVIDER', name: string) {
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    await auth.register({ accountType, fullName: name, email, password: PASSWORD } as never);
  } finally {
    spy.mockRestore();
  }
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date(), isActive: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, accessToken: login.accessToken };
}

async function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    const result = await fn();
    return { result, logs: spy.mock.calls.map((a) => a.map(String).join(' ')) };
  } finally {
    spy.mockRestore();
  }
}

function extractToken(logs: string[], marker: string): string {
  const line = logs.find((l) => l.includes(marker));
  if (!line) throw new Error(`missing marker ${marker}`);
  const m = line.match(/[0-9a-f]{32,}/i);
  if (!m) throw new Error('no token in log line');
  return m[0];
}

function payload(name: string) {
  return {
    type: 'INDIVIDUAL' as const,
    name: `SR ${name} ${runTag}`,
    directEmail: testEmail(`${name}-direct`),
    directPhone: '+15550001111',
  };
}
beforeAll(async () => {
  await prisma.$connect();
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.mobileVerificationToken.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
}, 30000);

afterAll(async () => {
  await app.close();
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.mobileVerificationToken.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  await prisma.client.deleteMany({ where: { directEmail: { contains: runTag } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.emailVerificationToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.organizationMembership.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: runTag } } });
  await prisma.$disconnect();
});
describe('L1 self-registration', () => {
  it('start PENDING then activate ACTIVE with scoped events', async () => {
    const user = await registerLogin('INDIVIDUAL_BUSINESS', 'sr-ok');
    const { result, logs } = await withCapturedLogs(() =>
      http.post('/api/onboarding/start').set('Authorization', `Bearer ${user.accessToken}`).send(payload('ok')),
    );
    expect(result.status).toBe(201);
    expect(result.body.onboardingStatus).toBe('PENDING');
    const clientId = result.body.clientId as string;
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).ownerUserId).toBeNull();
    const raw = extractToken(logs, 'Mobile verification token');
    const activate = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token: raw });
    expect(activate.status).toBe(200);
    const active = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(active.onboardingStatus).toBe('ACTIVE');
    expect(active.ownerUserId).toBe(user.id);
    const actions = (await prisma.clientEvent.findMany({ where: { clientId } })).map((e) => e.action);
    expect(actions).toContain('client.created');
    expect(actions).toContain('client.bound');
    expect(actions).toContain('client.activated');
  });

  it('mobile token single-use', async () => {
    const user = await registerLogin('INDIVIDUAL_BUSINESS', 'sr-once');
    const { result, logs } = await withCapturedLogs(() =>
      http.post('/api/onboarding/start').set('Authorization', `Bearer ${user.accessToken}`).send(payload('once')),
    );
    expect(result.status).toBe(201);
    const raw = extractToken(logs, 'Mobile verification token');
    expect(
      (await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${user.accessToken}`).send({ token: raw }))
        .status,
    ).toBe(200);
    expect(
      (await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${user.accessToken}`).send({ token: raw }))
        .status,
    ).toBe(403);
  });

  it('SERVICE_PROVIDER rejected', async () => {
    const sp = await registerLogin('SERVICE_PROVIDER', 'sr-sp');
    const res = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${sp.accessToken}`)
      .send(payload('sp'));
    expect(res.status).toBe(403);
  });

  it('already-bound rejected CLIENT_ALREADY_BOUND', async () => {
    const user = await registerLogin('INDIVIDUAL_BUSINESS', 'sr-bound');
    const { result, logs } = await withCapturedLogs(() =>
      http.post('/api/onboarding/start').set('Authorization', `Bearer ${user.accessToken}`).send(payload('b1')),
    );
    expect(result.status).toBe(201);
    const raw = extractToken(logs, 'Mobile verification token');
    expect(
      (await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${user.accessToken}`).send({ token: raw }))
        .status,
    ).toBe(200);
    const second = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(payload('b2'));
    expect(second.status).toBe(409);
    expect(JSON.stringify(second.body)).toMatch(/CLIENT_ALREADY_BOUND/);
  });

  it('hash-only mobile storage, no raw leak', async () => {
    const user = await registerLogin('INDIVIDUAL_BUSINESS', 'sr-hash');
    const { result, logs } = await withCapturedLogs(() =>
      http.post('/api/onboarding/start').set('Authorization', `Bearer ${user.accessToken}`).send(payload('hash')),
    );
    expect(result.status).toBe(201);
    const raw = extractToken(logs, 'Mobile verification token');
    const { createHash } = await import('node:crypto');
    expect(
      await prisma.mobileVerificationToken.findUnique({
        where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
      }),
    ).toBeTruthy();
    expect(await prisma.mobileVerificationToken.findFirst({ where: { tokenHash: raw } })).toBeNull();
  });
});
