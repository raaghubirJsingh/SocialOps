/**
 * Activation recovery for accounts with no persona on record (regression).
 *
 * Root cause this pins: `Client.type` is NOT NULL, and accounts created
 * before the persona was captured at registration have
 * `User.clientType = NULL` with no recoverable source (their
 * PendingRegistration row is deleted on completion). The 1-Click path could
 * therefore never construct a Client for them.
 *
 * Contract under test:
 *   1. With no persona available the endpoint refuses SAFELY, naming the
 *      exact missing field (ONBOARDING_PROFILE_INCOMPLETE) instead of a
 *      misleading validation error.
 *   2. An explicit choice supplied by the signed-in user unblocks it, and
 *      the server PERSISTS that choice to their own account so the question
 *      is never asked twice.
 *   3. Tenant isolation: the Client is bound to the JWT subject only, and
 *      another tenant's existing Client is never adopted or modified.
 *
 * DESTRUCTION NOTE: this spec touches ONLY rows matching its own unique
 * runTag email. Never run it as part of a broad sweep against a shared
 * database.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { createActiveUser } from './helpers/active-user.factory.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-persona-access-32c';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-persona-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `persona-${randomUUID()}`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

/** An account with a verified phone but NO persona on record. */
async function personaLessUser(name: string) {
  const auth = app.get(AuthService);
  const email = `${name}.${runTag}@example.test`;
  await createActiveUser(prisma, {
    email,
    fullName: name,
    accountType: 'CLIENT',
    phone: '+919876543210',
    password: PASSWORD,
  });
  const login = await auth.login({ email, password: PASSWORD });
  return { email, accessToken: login.accessToken };
}

beforeAll(async () => {
  await prisma.$connect();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
}, 30000);

afterAll(async () => {
  await app.close();
  await prisma.mobileVerificationToken.deleteMany({
    where: { client: { directEmail: { contains: runTag } } },
  });
  await prisma.clientEvent.deleteMany({
    where: { client: { directEmail: { contains: runTag } } },
  });
  await prisma.client.deleteMany({
    where: { directEmail: { contains: runTag } },
  });
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.$disconnect();
});


describe('activation without a stored persona', () => {
  it('refuses safely and names the missing field when no persona exists', async () => {
    const user = await personaLessUser('noref');
    const res = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONBOARDING_PROFILE_INCOMPLETE');
    expect(res.body.missing).toBe('clientType');
    // No half-built Client may be left behind by the refusal.
    expect(
      await prisma.client.findFirst({
        where: { ownerUser: { email: user.email } },
      }),
    ).toBeNull();
  });

  it('activates on an explicit choice and persists it to the caller account', async () => {
    const user = await personaLessUser('choose');
    const res = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ type: 'INDIVIDUAL' });

    expect(res.status).toBe(201);
    expect(res.body.onboardingStatus).toBe('ACTIVE');
    expect(res.body.mobileVerificationRequired).toBe(false);

    const client = await prisma.client.findFirstOrThrow({
      where: { ownerUser: { email: user.email } },
    });
    expect(client.type).toBe('INDIVIDUAL');
    expect(client.onboardingStatus).toBe('ACTIVE');
    expect(client.onboardingCompletedAt).not.toBeNull();

    // The choice is stored on the caller's OWN row so it is asked once only.
    const dbUser = await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
    });
    expect(dbUser.clientType).toBe('INDIVIDUAL');
  });

  it('never asks twice: a second call needs no persona in the payload', async () => {
    const user = await personaLessUser('once');
    const first = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ type: 'BUSINESS' });
    expect(first.status).toBe(201);

    // Already ACTIVE: refused as bound, and NOT as a missing persona.
    const second = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CLIENT_ALREADY_BOUND');
  });

  it('cannot reach another tenant: the bound Client is always the caller own', async () => {
    const owner = await personaLessUser('tenant-owner');
    const created = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'INDIVIDUAL' });
    expect(created.status).toBe(201);
    const clientId = created.body.clientId as string;

    // A different, persona-less user must NOT be able to claim it, and the
    // attempt must not mutate the owner's Client.
    const intruder = await personaLessUser('tenant-intruder');
    const attempt = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ type: 'BUSINESS' });

    expect(attempt.status).toBe(201);
    expect(attempt.body.clientId).not.toBe(clientId);

    const ownerClient = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      include: { ownerUser: { select: { email: true } } },
    });
    expect(ownerClient.ownerUser?.email).toBe(owner.email);
    expect(ownerClient.type).toBe('INDIVIDUAL');
  });

  it('rejects an unauthenticated activation attempt', async () => {
    const res = await http.post('/api/onboarding/start').send({});
    expect([401, 403]).toContain(res.status);
  });

  it('rejects a persona value outside the approved enum', async () => {
    const user = await personaLessUser('badtype');
    const res = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ type: 'NOT_A_CLIENT_TYPE' });
    expect(res.status).toBe(400);
  });
});