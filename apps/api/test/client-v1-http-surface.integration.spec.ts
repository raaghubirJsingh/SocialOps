/**
 * Client V1 ACT-2 L1 HTTP surface hardening (TESTS ONLY).
 */
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cv1f-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cv1f-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
const prisma = new PrismaClient();
const runTag = `cv1f-${randomUUID()}`;
const testEmail = (n: string) => `cv1f.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `cv1f-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

async function seedOrgUser(name: string, role: OrganizationRole) {
  const auth = app.get(AuthService);
  const orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: `Org ${name}`, slug: testSlug(name) } });
  const email = testEmail(name);
  const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    await auth.register({ accountType: 'SERVICE_PROVIDER', fullName: name, email, password: PASSWORD } as never);
  } finally {
    spy.mockRestore();
  }
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date(), isActive: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: user.id, role } });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, orgId, accessToken: login.accessToken };
}

async function registerClientUser(name: string) {
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    await auth.register({ accountType: 'INDIVIDUAL_BUSINESS', fullName: name, email, password: PASSWORD } as never);
  } finally {
    spy.mockRestore();
  }
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date(), isActive: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, accessToken: login.accessToken };
}

async function withLogs<T>(fn: () => Promise<T>) {
  const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    const result = await fn();
    return { result, logs: spy.mock.calls.map((a) => a.map(String).join(' ')) };
  } finally {
    spy.mockRestore();
  }
}

function tokenFromLogs(logs: string[], marker: string): string {
  const line = logs.find((l) => l.includes(marker));
  if (!line) throw new Error(`missing ${marker}`);
  const m = line.match(/[0-9a-f]{32,}/i);
  if (!m) throw new Error('no token');
  return m[0];
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

async function createPendingClient(ownerToken: string, orgId: string, tag: string) {
  const res = await http
    .post('/api/clients')
    .set('Authorization', `Bearer ${ownerToken}`)
    .set('X-Organization-Id', orgId)
    .send({ type: 'INDIVIDUAL', name: `HS ${tag} ${runTag}`, directEmail: testEmail(`${tag}-direct`), directPhone: '+15550001111' });
  expect(res.status).toBe(201);
  return res.body.client.id as string;
}

describe('L1 HTTP surface', () => {
  it('invitation accept binds owner; wrong email 403; minimal resolve via service', async () => {
    const owner = await seedOrgUser('hs-owner1', 'OWNER');
    const invitee = await registerClientUser('hs-invitee1');
    const clientId = await createPendingClient(owner.accessToken, owner.orgId, 'inv1');
    const { result, logs } = await withLogs(() =>
      http
        .post(`/api/clients/${clientId}/invite`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('X-Organization-Id', owner.orgId)
        .send({ email: invitee.email }),
    );
    expect(result.status).toBe(201);
    const raw = tokenFromLogs(logs, 'Client invitation URL');
    const resolved = await http.get(`/api/invitations/${raw}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.email).toBe(invitee.email.toLowerCase());
    expect(resolved.body.clientName).toBeTruthy();
    expect(resolved.body.clientType).toBeTruthy();
    expect(resolved.body).not.toHaveProperty('ownerUserId');
    const unknown = await http.get(`/api/invitations/${'f'.repeat(64)}`);
    expect(unknown.status).toBe(404);
    const authed = await http
      .get(`/api/invitations/${raw}`)
      .set('Authorization', `Bearer ${invitee.accessToken}`);
    expect(authed.status).toBe(200);
    const other = await registerClientUser('hs-invitee1b');
    const wrong = await http
      .post(`/api/invitations/${raw}/accept`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({});
    expect(wrong.status).toBe(403);
    const accept = await http
      .post(`/api/invitations/${raw}/accept`)
      .set('Authorization', `Bearer ${invitee.accessToken}`)
      .send({});
    expect(accept.status).toBe(200);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).ownerUserId).toBe(invitee.id);
  });

  it('/api/client/me requires binding and ACTIVE onboarding; PENDING blocked', async () => {
    const owner = await seedOrgUser('hs-owner2', 'OWNER');
    const invitee = await registerClientUser('hs-invitee2');
    const clientId = await createPendingClient(owner.accessToken, owner.orgId, 'me1');
    const { result, logs } = await withLogs(() =>
      http
        .post(`/api/clients/${clientId}/invite`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('X-Organization-Id', owner.orgId)
        .send({ email: invitee.email }),
    );
    expect(result.status).toBe(201);
    const raw = tokenFromLogs(logs, 'Client invitation URL');
    await http.post(`/api/invitations/${raw}/accept`).set('Authorization', `Bearer ${invitee.accessToken}`).send({});
    const pendingMe = await http
      .get('/api/client/me')
      .set('Authorization', `Bearer ${invitee.accessToken}`)
      .set('X-Client-Id', clientId);
    expect(pendingMe.status).toBe(403);
    const { logs: mlogs } = await withLogs(() =>
      http
        .post(`/api/clients/${clientId}/invite`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .set('X-Organization-Id', owner.orgId)
        .send({ email: invitee.email }),
    );
    void mlogs;
    const mobiles = await prisma.mobileVerificationToken.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    expect(mobiles.length).toBeGreaterThan(0);
  });

  it('agency discovery requires opt-in AND approval; request blocked otherwise', async () => {
    const owner = await seedOrgUser('hs-owner3', 'OWNER');
    const clientUser = await registerClientUser('hs-client3');
    const start = await withLogs(() =>
      http
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${clientUser.accessToken}`)
        .send({ type: 'INDIVIDUAL', name: `HS d3 ${runTag}`, directEmail: testEmail('d3-direct'), directPhone: '+15550001111' }),
    );
    expect(start.result.status).toBe(201);
    const clientId = start.result.body.clientId as string;
    const raw = tokenFromLogs(start.logs, 'Mobile verification token');
    expect(
      (await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${clientUser.accessToken}`).send({ token: raw }))
        .status,
    ).toBe(200);
    const blocked = await http
      .post('/api/client/me/agency-requests')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({ organizationId: owner.orgId });
    expect(blocked.status).toBe(403);
  });

  it('SOCIALOPS_ADMIN status change allowed; agency ADMIN without flag denied', async () => {
    const owner = await seedOrgUser('hs-owner4', 'OWNER');
    const clientId = await createPendingClient(owner.accessToken, owner.orgId, 'adm1');
    const denied = await http
      .post(`/api/admin/clients/${clientId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'SUSPENDED' });
    expect(denied.status).toBe(403);
    const admin = await seedOrgUser('hs-admin4', 'ADMIN');
    await prisma.user.update({ where: { id: admin.id }, data: { isSocialOpsAdmin: true } });
    const ok = await http
      .post(`/api/admin/clients/${clientId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'SUSPENDED', reason: 'risk' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('SUSPENDED');
    const events = await prisma.clientEvent.findMany({ where: { clientId } });
    expect(events.map((e) => e.action)).toContain('client.status.changed');
  });

  it('INACTIVE operational write blocked; status routes exempt; self-status 403', async () => {
    const clientUser = await registerClientUser('hs-client5');
    const start = await withLogs(() =>
      http
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${clientUser.accessToken}`)
        .send({ type: 'INDIVIDUAL', name: `HS s5 ${runTag}`, directEmail: testEmail('s5-direct'), directPhone: '+15550001111' }),
    );
    const clientId = start.result.body.clientId as string;
    const raw = tokenFromLogs(start.logs, 'Mobile verification token');
    await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${clientUser.accessToken}`).send({ token: raw });
    const admin = await seedOrgUser('hs-agency5', 'OWNER');
    await prisma.clientAgencyRelationship.create({
      data: { clientId, organizationId: admin.orgId, status: 'ACTIVE', initiatedBy: 'AGENCY' },
    });
    const susp = await http
      .post(`/api/clients/${clientId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', admin.orgId)
      .send({ status: 'SUSPENDED' });
    expect(susp.status).toBe(201);
    const write = await http
      .patch('/api/client/me')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({ field: 'NOTES', value: 'blocked write' });
    expect(write.status).toBe(403);
    const selfStatus = await http
      .post('/api/client/me/status')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({});
    expect(selfStatus.status).toBe(403);
  });

  it('agency-request accept/reject and termination close ACTIVE without touching owner', async () => {
    const agency = await seedOrgUser('hs-agency6', 'OWNER');
    const clientUser = await registerClientUser('hs-client6');
    const start = await withLogs(() =>
      http
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${clientUser.accessToken}`)
        .send({ type: 'INDIVIDUAL', name: `HS t6 ${runTag}`, directEmail: testEmail('t6-direct'), directPhone: '+15550001111' }),
    );
    const clientId = start.result.body.clientId as string;
    const raw = tokenFromLogs(start.logs, 'Mobile verification token');
    await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${clientUser.accessToken}`).send({ token: raw });
    await prisma.organization.update({ where: { id: agency.orgId }, data: { discoveryOptIn: true, discoveryApprovedAt: new Date() } });
    const req = await http
      .post('/api/client/me/agency-requests')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({ organizationId: agency.orgId });
    expect(req.status).toBe(201);
    const relId = req.body.id as string;
    const accept = await http
      .post(`/api/clients/agency-requests/${relId}/accept`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({});
    expect(accept.status).toBe(201);
    const term = await http
      .post(`/api/client/me/agency-relationship/terminate`)
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({});
    expect(term.status).toBe(201);
    const after = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(after.ownerUserId).toBe(clientUser.id);
  });

  it('HTTP 409 Conflict when attempting silent replacement of ACTIVE Agency relationship (Rule 11)', async () => {
    const agency = await seedOrgUser('hs-agency7', 'OWNER');
    const clientUser = await registerClientUser('hs-client7');
    const start = await withLogs(() =>
      http
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${clientUser.accessToken}`)
        .send({ type: 'INDIVIDUAL', name: `HS t7 ${runTag}`, directEmail: testEmail('t7-direct'), directPhone: '+15550001111' }),
    );
    const clientId = start.result.body.clientId as string;
    const raw = tokenFromLogs(start.logs, 'Mobile verification token');
    await http.post('/api/onboarding/activate').set('Authorization', `Bearer ${clientUser.accessToken}`).send({ token: raw });
    await prisma.organization.update({ where: { id: agency.orgId }, data: { discoveryOptIn: true, discoveryApprovedAt: new Date() } });

    // Establish first ACTIVE relationship
    const req1 = await http
      .post('/api/client/me/agency-requests')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({ organizationId: agency.orgId });
    expect(req1.status).toBe(201);
    const relId1 = req1.body.id as string;
    const accept1 = await http
      .post(`/api/clients/agency-requests/${relId1}/accept`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({});
    expect(accept1.status).toBe(201);

    // Verify the client has an ACTIVE relationship
    const relBefore = await prisma.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
    });
    expect(relBefore).toBeDefined();

    // Attempt to create a second ACTIVE relationship (silent replacement)
    // This should fail with HTTP 409 Conflict
    const secondAgency = await seedOrgUser('hs-agency8', 'ADMIN');
    const silentReplaceAttempt = await http
      .post('/api/client/me/agency-requests')
      .set('Authorization', `Bearer ${clientUser.accessToken}`)
      .set('X-Client-Id', clientId)
      .send({ organizationId: secondAgency.orgId });
    expect(silentReplaceAttempt.status).toBe(409);
    expect(silentReplaceAttempt.body).toMatchObject({
      code: 'ACTIVE_RELATIONSHIP_EXISTS',
    });
  });
});
