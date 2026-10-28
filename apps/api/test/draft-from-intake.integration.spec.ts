/**
 * Draft-from-intake manual V1 workflow.
 *
 * Verifies the agency-side raw-data detail route and the RawData -> Content
 * Draft flow against real PostgreSQL:
 *   1. intake detail is readable by any scoped organization member (no role
 *      guard on GET; RoleGuard only gates mutations);
 *   2. cross-tenant and cross-client isolation on intake detail route
 *      (uniform 404);
 *   3. RawData insert-only contract: raw-data creation is ADMIN-only and the
 *      intake record carries no contentId before a draft exists;
 *   4. draft-from-intake: a DRAFT is created through the existing Content
 *      create transaction (server-forced DRAFT, no status coercion);
 *   5. provenance: `Drafted from client intake <rawDataId>` is recorded as an
 *      agency-only internal note;
 *   6. tenant isolation for provenance note: a foreign agency cannot read or
 *      write notes for a client it does not manage.
 *
 * ISOLATION: this spec REFUSES to run unless DATABASE_URL points at a
 * disposable test database (name must end in `_test` / `_itest`), matching the
 * guard already used by `client-socialops-provider.integration.spec.ts`. It
 * never touches the development database.
 */
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { createActiveUser } from './helpers/active-user.factory.js';
// The guard runs at module load, before any Prisma call can be made.
const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/(^|_)(test|itest)$/.test(dbName)) {
  throw new Error(
    `REFUSING TO RUN: DATABASE_URL points at "${dbName}", which is not an ` +
      'isolated test database. Integration specs must never target the ' +
      'development database.',
  );
}
// Test configuration defaults (existing pattern, matching
// client-operations-v1.integration.spec.ts).
if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-dfi-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-dfi-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
/** Agency-side actor: an Organization plus a member holding `role`. */
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
/** A CLIENT account that has NOT yet onboarded a Client. */
async function registerClientUser(name: string) {
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const user = await createActiveUser(prisma, {
    email,
    fullName: name,
    accountType: 'CLIENT',
    password: PASSWORD,
  });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, accessToken: login.accessToken };
}
/** A Client-scoped actor with an ACTIVE onboarding lifecycle. */
async function onboardedClient(name: string) {
  const user = await registerClientUser(name);
  const loggerCalls: string[][] = [];
  const originalLog = Logger.prototype.log;
  Logger.prototype.log = function (...args: unknown[]) {
    loggerCalls.push(args.map(String));
    return undefined as never;
  };
  try {
    const start = await http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        type: 'INDIVIDUAL',
        name: `CO ${name} ${runTag}`,
        directEmail: testEmail(`${name}-direct`),
        directPhone: '+15550002222',
      });
    expect(start.status).toBe(201);
    const clientId = start.body.clientId as string;
    const logs = loggerCalls.map((a) => a.join(' '));
    const line = logs.find((l) => l.includes('Mobile verification token'));
    if (!line) throw new Error('missing Mobile verification token');
    const match = line.match(/[0-9a-f]{32,}/i);
    if (!match) throw new Error('no token');
    const activate = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token: match[0] });
    expect(activate.status).toBe(200);
      // Decision 023 (GA 2026-10-19): content creation requires at least one active SocialAccount for the client.
      // This fixture gives the client one here so content creation reaches the API boundary (201) instead of SOCIAL_ACCOUNT_REQUIRED (409).
      await prisma.socialAccount.create({
      data: {
      clientId,
      platform: 'INSTAGRAM',
      handle: `@${name}-active`,
      displayName: `Active ${name} social account`,
      isActive: true,
      },
      });
    return { ...user, clientId };

  } finally {
    Logger.prototype.log = originalLog;
  }
}
/** Establishes an ACTIVE Client <-> Agency relationship through the real flow. */
async function linkAgency(
  client: { clientId: string; accessToken: string },
  agency: { orgId: string; accessToken: string },
) {
  await prisma.organization.update({
    where: { id: agency.orgId },
    data: { discoveryOptIn: true, discoveryApprovedAt: new Date() },
  });
  const released = await http
    .post('/api/client/me/agency-relationship/terminate')
    .set('Authorization', `Bearer ${client.accessToken}`)
    .set('X-Client-Id', client.clientId)
    .send({});
  expect(released.status).toBe(201);
  const requested = await http
    .post('/api/client/me/agency-requests')
    .set('Authorization', `Bearer ${client.accessToken}`)
    .set('X-Client-Id', client.clientId)
    .send({ organizationId: agency.orgId });
  expect(requested.status).toBe(201);
  const accepted = await http
    .post(`/api/clients/agency-requests/${requested.body.id as string}/accept`)
    .set('Authorization', `Bearer ${agency.accessToken}`)
    .set('X-Organization-Id', agency.orgId)
    .send({});
  expect(accepted.status).toBe(201);
}
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
const prisma = new PrismaClient();
const runTag = `dfi-${randomUUID()}`;
const testEmail = (n: string) => `dfi.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `dfi-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';
let app: INestApplication;
let http: ReturnType<typeof request>;
beforeAll(async () => {
  await prisma.$connect();
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
  await prisma.internalNote.deleteMany({});
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
  await prisma.internalNote.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({
    where: { organization: { slug: { contains: runTag } } },
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
  await prisma.organization.deleteMany({
    where: { slug: { contains: runTag } },
  });
  await prisma.$disconnect();
}, 30000);
describe('RawData intake detail route', () => {
  it('returns 404 for a non-existent raw-data record', async () => {
    const { accessToken, orgId } = await seedOrgUser('detail404', 'ADMIN');
    const res = await http
      .get(
        '/api/clients/00000000-0000-0000-0000-000000000000/raw-data/00000000-0000-0000-0000-000000000000',
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Organization-Id', orgId);
    expect(res.status).toBe(404);
  });
  it.each([['OWNER'], ['ADMIN'], ['MEMBER'], ['VIEWER']] as const)(
    'allows %s to read an in-scope intake record (200)',
    async (role) => {
      const fixture = await seedIntake(`read-${role.toLowerCase()}`, 'ADMIN');
      const member = await seedOrgUser(`reader-${role.toLowerCase()}`, role);
      await prisma.organizationMembership.create({
        data: { organizationId: fixture.orgId, userId: member.id, role },
      });
      const res = await http
        .get(`/api/clients/${fixture.clientId}/raw-data/${fixture.rawDataId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .set('X-Organization-Id', fixture.orgId);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixture.rawDataId);
      expect(res.body.clientId).toBe(fixture.clientId);
    },
  );
  it('returns 404 for a foreign agency (cross-tenant isolation)', async () => {
    const foreign = await seedOrgUser('foreign-read', 'ADMIN');
    const fixture = await seedIntake('foreign-read-target', 'ADMIN');
    const res = await http
      .get(`/api/clients/${fixture.clientId}/raw-data/${fixture.rawDataId}`)
      .set('Authorization', `Bearer ${foreign.accessToken}`)
      .set('X-Organization-Id', foreign.orgId);
    expect(res.status).toBe(404);
  });
  it('returns 404 for cross-client access within the same agency', async () => {
    const agency = await seedOrgUser('cross-client-agency', 'ADMIN');
    const first = await seedIntake('cross-client-first', 'ADMIN');
    const second = await seedIntake('cross-client-second', 'ADMIN');
    await linkAgency(
      { clientId: first.clientId, accessToken: first.clientToken },
      agency,
    );
    await linkAgency(
      { clientId: second.clientId, accessToken: second.clientToken },
      agency,
    );
    const res = await http
      .get(`/api/clients/${second.clientId}/raw-data/${first.rawDataId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(res.status).toBe(404);
  });
  it('rejects raw-data creation for MEMBER/VIEWER and leaves contentId null', async () => {
    const agency = await seedOrgUser('intake-gate-agency', 'ADMIN');
    const client = await onboardedClient('intake-gate-client');
    await linkAgency(client, agency);
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const member = await seedOrgUser(
        `intake-gate-${role.toLowerCase()}`,
        role,
      );
      await prisma.organizationMembership.create({
        data: { organizationId: agency.orgId, userId: member.id, role },
      });
      const res = await http
        .post(`/api/clients/${client.clientId}/raw-data`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .set('X-Organization-Id', agency.orgId)
        .send({ source: 'CLIENT_FORM', extractedText: 'nope' });
      expect(res.status).toBe(403);
    }
    const intake = await seedIntake('intake-null-content', 'ADMIN');
    expect(intake.contentId).toBeNull();
  });
});
describe('Draft-from-intake flow', () => {
  it('creates a DRAFT Content with revision 1 and null scenarioType', async () => {
    const fixture = await seedIntake('draft-flow', 'ADMIN');
    const intake = await prisma.rawData.findUnique({
      where: { id: fixture.rawDataId },
    });
    expect(intake).not.toBeNull();
    expect(intake?.contentId).toBeNull();
    const before = await prisma.rawData.findUniqueOrThrow({
      where: { id: fixture.rawDataId },
    });
    const res = await http
      .post(`/api/clients/${fixture.clientId}/content`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({
        title:
          intake?.extractedText?.split('\n')[0]?.trim().slice(0, 300) ??
          'Test title',
        body: intake?.extractedText ?? 'Test body',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.scenarioType).toBeNull();
    const content = await prisma.content.findUnique({
      where: { id: res.body.id as string },
    });
    expect(content?.clientId).toBe(fixture.clientId);
    expect(content?.agencyId).toBe(fixture.orgId);
    const revision = await prisma.contentRevision.findUnique({
      where: {
        contentId_revision: { contentId: res.body.id as string, revision: 1 },
      },
    });
    expect(revision?.revision).toBe(1);
    expect(revision?.title).toBe(res.body.title);
    expect(revision?.body).toBe(res.body.body);
    const after = await prisma.rawData.findUniqueOrThrow({
      where: { id: fixture.rawDataId },
    });
    expect(after).toEqual(before);
    expect(after.contentId).toBeNull();
  });
  it('rejects draft creation for MEMBER/VIEWER', async () => {
    const fixture = await seedIntake('draft-gate', 'ADMIN');
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const member = await seedOrgUser(
        `draft-gate-${role.toLowerCase()}`,
        role,
      );
      await prisma.organizationMembership.create({
        data: { organizationId: fixture.orgId, userId: member.id, role },
      });
      const res = await http
        .post(`/api/clients/${fixture.clientId}/content`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .set('X-Organization-Id', fixture.orgId)
        .send({ title: 'Blocked', body: 'Blocked body' });
      expect(res.status).toBe(403);
    }
  });
  it('records provenance note with correct text', async () => {
    const fixture = await seedIntake('provisioning', 'ADMIN');
    const intake = await prisma.rawData.findUnique({
      where: { id: fixture.rawDataId },
    });
    const res = await http
      .post(`/api/clients/${fixture.clientId}/content`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({
        title:
          intake?.extractedText?.split('\n')[0]?.trim().slice(0, 300) ?? 'Test',
        body: intake?.extractedText ?? 'Test',
      });
    expect(res.status).toBe(201);
    const noteRes = await http
      .post(
        `/api/clients/${fixture.clientId}/content/${res.body.id as string}/internal-notes`,
      )
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({ body: `Drafted from client intake ${fixture.rawDataId}` });
    expect(noteRes.status).toBe(201);
    expect(noteRes.body.body).toBe(
      `Drafted from client intake ${fixture.rawDataId}`,
    );
    const note = await prisma.internalNote.findUnique({
      where: { id: noteRes.body.id as string },
    });
    expect(note?.agencyId).toBe(fixture.orgId);
    expect(note?.contentId).toBe(res.body.id);
  });
  it('links one draft to its Content Request and exposes it only to that client', async () => {
    const fixture = await seedIntake('request-association', 'ADMIN');
    const before = await prisma.rawData.findUniqueOrThrow({
      where: { id: fixture.rawDataId },
    });
    const clientB = await onboardedClient('request-association-client-b');
    await linkAgency(
      { clientId: clientB.clientId, accessToken: clientB.accessToken },
      { orgId: fixture.orgId, accessToken: fixture.accessToken },
    );
    const crossClientDraft = await http
      .post(
        `/api/clients/${clientB.clientId}/content/from-request/${fixture.rawDataId}`,
      )
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({ title: 'Unauthorized draft', body: 'Client A request' });
    expect(crossClientDraft.status).toBe(404);
    expect(
      await prisma.content.findUnique({
        where: { sourceRequestId: fixture.rawDataId },
        select: { id: true },
      }),
    ).toBeNull();
    const created = await http
      .post(
        `/api/clients/${fixture.clientId}/content/from-request/${fixture.rawDataId}`,
      )
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({ title: 'Associated draft', body: 'First SocialOps draft' });
    expect(created.status).toBe(201);
    const content = await prisma.content.findUniqueOrThrow({
      where: { id: created.body.id as string },
      select: { sourceRequestId: true, clientId: true },
    });
    expect(content.sourceRequestId).toBe(fixture.rawDataId);
    expect(content.clientId).toBe(fixture.clientId);
    const after = await prisma.rawData.findUniqueOrThrow({
      where: { id: fixture.rawDataId },
    });
    expect(after).toEqual(before);
    expect(after.contentId).toBeNull();
    const requestView = await http
      .get(`/api/client/me/raw-data/content-requests/${fixture.rawDataId}`)
      .set('Authorization', `Bearer ${fixture.clientToken}`)
      .set('X-Client-Id', fixture.clientId);
    expect(requestView.status).toBe(200);
    expect(requestView.body.requestedContent.id).toBe(created.body.id);
    expect(requestView.body.requestedContent.body).toBe(
      'First SocialOps draft',
    );
    expect(requestView.body.requestedContent).not.toHaveProperty('status');
    const duplicate = await http
      .post(
        `/api/clients/${fixture.clientId}/content/from-request/${fixture.rawDataId}`,
      )
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({ title: 'Another draft', body: 'Should not be created' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONTENT_REQUEST_ALREADY_DRAFTED');
    const foreign = await seedIntake('request-association-foreign', 'ADMIN');
    const crossClient = await http
      .get(`/api/client/me/raw-data/content-requests/${fixture.rawDataId}`)
      .set('Authorization', `Bearer ${foreign.clientToken}`)
      .set('X-Client-Id', foreign.clientId);
    expect(crossClient.status).toBe(404);
  }, 40000);
});
describe('Tenant isolation for provenance note', () => {
  it('foreign agency cannot create internal note on another tenant content (404)', async () => {
    const foreign = await seedOrgUser('foreign-note', 'ADMIN');
    const fixture = await seedIntake('foreign-note-target', 'ADMIN');
    const intake = await prisma.rawData.findUnique({
      where: { id: fixture.rawDataId },
    });
    const res = await http
      .post(`/api/clients/${fixture.clientId}/content`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('X-Organization-Id', fixture.orgId)
      .send({
        title:
          intake?.extractedText?.split('\n')[0]?.trim().slice(0, 300) ?? 'Test',
        body: intake?.extractedText ?? 'Test',
      });
    expect(res.status).toBe(201);
    const noteRes = await http
      .post(
        `/api/clients/${fixture.clientId}/content/${res.body.id as string}/internal-notes`,
      )
      .set('Authorization', `Bearer ${foreign.accessToken}`)
      .set('X-Organization-Id', foreign.orgId)
      .send({ body: 'foreign' });
    expect(noteRes.status).toBe(404);
  });
});
async function seedIntake(name: string, role: OrganizationRole) {
  const agency = await seedOrgUser(`${name}-agency`, role);
  const client = await onboardedClient(`${name}-client`);
  await linkAgency(client, agency);
  const intakeText = `Draft from intake ${name}\nSecond line for ${dateTime()}`;
  const created = await http
    .post(`/api/clients/${client.clientId}/raw-data`)
    .set('Authorization', `Bearer ${agency.accessToken}`)
    .set('X-Organization-Id', agency.orgId)
    .send({ source: 'CLIENT_FORM', extractedText: intakeText });
  expect(created.status).toBe(201);
  expect(created.body.contentId).toBeNull();
  return {
    accessToken: agency.accessToken,
    orgId: agency.orgId,
    clientId: client.clientId,
    clientToken: client.accessToken,
    rawDataId: created.body.id as string,
    contentId: created.body.contentId as string | null,
  };
}
function dateTime(): string {
  return new Date().toISOString();
}
/**
 * Decision 022 focused tests (no server changes; appended to the
 * 'Draft-from-intake flow' suite). Run against the isolated test database:
 * they create their own client/organization records and are cleaned up by
 * the suite-level afterAll (content/rawData/revision/internalNote deleted).
 */
describe('Decision 022: source-type gating and uniqueness-conflict fallback', () => {
  it('rejects a draft from every non-CLIENT_FORM raw-data source (404)', async () => {
    const org = await seedOrgUser('src-gate', 'ADMIN');
    const client = await onboardedClient('src-gate-client');
    await linkAgency(client, org);
    for (const source of ['CLIENT_UPLOAD', 'AGENCY_UPLOAD', 'EXTERNAL_IMPORT'] as const) {
      const request = await prisma.rawData.create({
        data: {
          source,
          clientId: client.clientId,
          extractedText: `${source.toLowerCase().replace(/_/g, ' ')} payload`,
          contentHash: createHash('sha256').update(source + client.clientId).digest('hex'),
        },
      });
      expect(request).not.toBeNull();
      const res = await http
        .post(`/api/clients/${client.clientId}/content/from-request/${request.id}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ title: 'Gated draft', body: 'Should not be created' });
      // Decision 022 part 1: only CLIENT_FORM requests become drafts.
      expect(res.status).toBe(404);
    }
  });

  it('returns CONTENT_REQUEST_ALREADY_DRAFTED when the draft index conflicts (P2002 fallback)', async () => {
    const org = await seedOrgUser('src-confl', 'ADMIN');
    const client = await onboardedClient('src-confl-client');
    await linkAgency(client, org);
    const request = await prisma.rawData.create({
      data: {
        source: 'CLIENT_FORM',
        clientId: client.clientId,
        extractedText: 'conflicting drafts',
        contentHash: createHash('sha256').update('CLIENT_FORM' + client.clientId).digest('hex'),
      },
    });
    // Both calls enter the service's single $transaction. Each pre-check
    // misses (nothing committed yet), then both attempt the unique draft
    // insert: one wins, the other hits the P2002 unique-index violation, which
    // is mapped to the app-level conflict code.
    const [resolved, conflicting] = await Promise.all([
      http
        .post(`/api/clients/${client.clientId}/content/from-request/${request.id}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ title: 'A', body: 'A' }),
      http
        .post(`/api/clients/${client.clientId}/content/from-request/${request.id}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .set('X-Organization-Id', org.orgId)
        .send({ title: 'B', body: 'B' }),
    ]);
    // Which of the two concurrent calls wins the unique-index race is not
    // deterministic (socket/transaction scheduling decides), so assert the
    // invariant instead of the positional order: exactly one 201 and one 409.
    expect([resolved.status, conflicting.status].sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const loser = resolved.status === 409 ? resolved : conflicting;
    expect(loser.body.code).toBe('CONTENT_REQUEST_ALREADY_DRAFTED');
  });
});


