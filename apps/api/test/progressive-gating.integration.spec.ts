/**
 * Progressive Operational Gating - integration coverage (TESTS ONLY).
 *
 * Pins the Decision 023 backend lifecycle order against real PostgreSQL:
 *   Overview (onboarding ACTIVE) -> Social accounts -> Raw data -> Content.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { createActiveUser } from './helpers/active-user.factory.js';

const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/(^|_)(test|itest)$/.test(dbName)) {
  throw new Error(
    `REFUSING TO RUN: DATABASE_URL points at "${dbName}", which is not an ` +
      'isolated test database.',
  );
}

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-gate-access-32chars!';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-gate-refresh-32ch';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `gate-${randomUUID()}`;
const testEmail = (n: string) => `gate.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `gate-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

async function seedOrgUser(name: string, role: OrganizationRole) {
  const auth = app.get(AuthService);
  const orgId = randomUUID();
  await prisma.organization.create({
    data: { id: orgId, name: `Org ${name}`, slug: testSlug(name) },
  });
  const email = testEmail(name);
  const user = await createActiveUser(prisma, {
    email,
    fullName: name,
    accountType: 'SERVICE_PROVIDER',
    password: PASSWORD,
  });
  await prisma.organizationMembership.create({
    data: { organizationId: orgId, userId: user.id, role },
  });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, orgId, accessToken: login.accessToken };
}

beforeAll(async () => {
  await prisma.$connect();
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
  await prisma.socialAccount.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
}, 30000);

afterAll(async () => {
  await app?.close();
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
  await prisma.socialAccount.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  await prisma.client.deleteMany({
    where: { directEmail: { contains: runTag } },
  });
  await prisma.$disconnect();
}, 20000);

describe('Progressive gating - PENDING client', () => {
  it('keeps reads open but rejects agency writes with CLIENT_NOT_ACTIVE', async () => {
    const agency = await seedOrgUser('gate-agency1', 'OWNER');
    const res = await http
      .post('/api/clients')
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        type: 'INDIVIDUAL',
        name: `Gate pending1 ${runTag}`,
        directEmail: testEmail('pending1-direct'),
        directPhone: '+15550001111',
      });
    expect(res.status).toBe(201);
    const clientId = res.body.client.id as string;
    const auth = (r: request.Test) =>
      r
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .set('X-Organization-Id', agency.orgId);

    expect((await auth(http.get(`/api/clients/${clientId}`))).status).toBe(
      200,
    );
    expect(
      (await auth(http.get(`/api/clients/${clientId}/social-accounts`)))
        .status,
    ).toBe(200);
    expect(
      (await auth(http.get(`/api/clients/${clientId}/content`))).status,
    ).toBe(200);
    expect(
      (await auth(http.get(`/api/clients/${clientId}/raw-data`))).status,
    ).toBe(200);

    const sa = await auth(
      http
        .post(`/api/clients/${clientId}/social-accounts`)
        .send({ platform: 'INSTAGRAM', handle: '@pending' }),
    );
    expect(sa.status).toBe(403);
    expect(sa.body.code).toBe('CLIENT_NOT_ACTIVE');

    const content = await auth(
      http.post(`/api/clients/${clientId}/content`).send({
        title: 'Blocked draft',
        body: 'Should never exist.',
      }),
    );
    expect(content.status).toBe(403);
    expect(content.body.code).toBe('CLIENT_NOT_ACTIVE');

    const raw = await auth(
      http.post(`/api/clients/${clientId}/raw-data`).send({
        source: 'AGENCY_UPLOAD',
        extractedText: 'Blocked intake.',
      }),
    );
    expect(raw.status).toBe(403);
    expect(raw.body.code).toBe('CLIENT_NOT_ACTIVE');
  }, 30000);
});

describe('Progressive gating - ACTIVE client content dependency', () => {
  it('rejects creation with no active account, then allows it without a credential', async () => {
    const agency = await seedOrgUser('gate-agency2', 'OWNER');
    const res = await http
      .post('/api/clients')
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        type: 'INDIVIDUAL',
        name: `Gate active1 ${runTag}`,
        directEmail: testEmail('active1-direct'),
        directPhone: '+15550001111',
      });
    expect(res.status).toBe(201);
    const clientId = res.body.client.id as string;
    await prisma.client.update({
      where: { id: clientId },
      data: { onboardingStatus: 'ACTIVE' },
    });
    const auth = (r: request.Test) =>
      r
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .set('X-Organization-Id', agency.orgId);
    const base = `/api/clients/${clientId}/content`;

    const blocked = await auth(
      http.post(base).send({ title: 'No account', body: 'Blocked.' }),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SOCIAL_ACCOUNT_REQUIRED');

    const account = await auth(
      http
        .post(`/api/clients/${clientId}/social-accounts`)
        .send({ platform: 'INSTAGRAM', handle: '@active' }),
    );
    expect(account.status).toBe(201);

    const created = await auth(
      http.post(base).send({ title: 'First draft', body: 'Allowed.' }),
    );
    expect(created.status).toBe(201);
    const contentId = created.body.id as string;

    const deactivated = await auth(
      http
        .patch(`/api/clients/${clientId}/social-accounts/${account.body.id}`)
        .send({ isActive: false }),
    );
    expect(deactivated.status).toBe(200);

    const updated = await auth(
      http.patch(`${base}/${contentId}`).send({
        title: 'Edited after deactivation',
      }),
    );
    expect(updated.status).toBe(200);

    const transitioned = await auth(
      http.post(`${base}/${contentId}/status`).send({ to: 'IN_REVIEW' }),
    );
    // The status-transition endpoint is a POST with no @HttpCode override, so
    // NestJS defaults it to 201 — matching every other content spec.
    expect(transitioned.status).toBe(201);
  }, 30000);

  it('keeps RawData independent of the social-account gate', async () => {
    const agency = await seedOrgUser('gate-agency3', 'OWNER');
    const res = await http
      .post('/api/clients')
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        type: 'INDIVIDUAL',
        name: `Gate rawonly ${runTag}`,
        directEmail: testEmail('rawonly-direct'),
        directPhone: '+15550001111',
      });
    expect(res.status).toBe(201);
    const clientId = res.body.client.id as string;
    await prisma.client.update({
      where: { id: clientId },
      data: { onboardingStatus: 'ACTIVE' },
    });
    const raw = await http
      .post(`/api/clients/${clientId}/raw-data`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        source: 'AGENCY_UPLOAD',
        extractedText: 'Brief before any account.',
      });
    expect(raw.status).toBe(201);
  }, 30000);
});
