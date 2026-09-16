/**
 * Client Operations V1 - Social Accounts integration coverage (TESTS ONLY).
 *
 * Exercises the real HTTP surface against real PostgreSQL:
 *   - agency-side metadata CRUD (organization scope + RoleGuard);
 *   - client-side self-service (X-Client-Id binding);
 *   - metadata-only enforcement (a token-shaped key is rejected);
 *   - tenant isolation negatives (cross-agency 404, non-owner 403).
 */
import { createHash, randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cov1-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cov1-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `cov1-${randomUUID()}`;
const testEmail = (n: string) => `cov1.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `cov1-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';

const sha256Hex = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

let app: INestApplication;
let http: ReturnType<typeof request>;

async function seedOrgUser(name: string, role: OrganizationRole) {
  const auth = app.get(AuthService);
  const orgId = randomUUID();
  await prisma.organization.create({
    data: { id: orgId, name: `Org ${name}`, slug: testSlug(name) },
  });
  const email = testEmail(name);
  const spy = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  try {
    await auth.register({
      accountType: 'SERVICE_PROVIDER',
      fullName: name,
      email,
      password: PASSWORD,
    } as never);
  } finally {
    spy.mockRestore();
  }
  await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date(), isActive: true },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.organizationMembership.create({
    data: { organizationId: orgId, userId: user.id, role },
  });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, orgId, accessToken: login.accessToken };
}

async function registerClientUser(name: string) {
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const spy = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  try {
    await auth.register({
      accountType: 'INDIVIDUAL_BUSINESS',
      fullName: name,
      email,
      password: PASSWORD,
    } as never);
  } finally {
    spy.mockRestore();
  }
  await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date(), isActive: true },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const login = await auth.login({ email, password: PASSWORD });
  return { id: user.id, email, accessToken: login.accessToken };
}

async function withLogs<T>(fn: () => Promise<T>) {
  const spy = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  try {
    const result = await fn();
    return {
      result,
      logs: spy.mock.calls.map((a) => a.map(String).join(' ')),
    };
  } finally {
    spy.mockRestore();
  }
}

function tokenFromLogs(logs: string[], marker: string): string {
  const line = logs.find((l) => l.includes(marker));
  if (!line) throw new Error(`missing ${marker}`);
  const match = line.match(/[0-9a-f]{32,}/i);
  if (!match) throw new Error('no token');
  return match[0];
}

/**
 * A CLIENT-scoped actor with an ACTIVE onboarding lifecycle: the direct
 * User -> Client binding and onboardingStatus=ACTIVE that ClientAccessGuard
 * requires are both established through the real approved flow.
 */
async function onboardedClient(name: string) {
  const user = await registerClientUser(name);
  const start = await withLogs(() =>
    http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        type: 'INDIVIDUAL',
        name: `CO ${name} ${runTag}`,
        directEmail: testEmail(`${name}-direct`),
        directPhone: '+15550002222',
      }),
  );
  const clientId = start.result.body.clientId as string;
  const raw = tokenFromLogs(start.logs, 'Mobile verification token');
  await http
    .post('/api/onboarding/activate')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ token: raw });
  return { ...user, clientId };
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

beforeAll(async () => {
  await prisma.$connect();
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
  await prisma.socialAccount.deleteMany({});
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.mobileVerificationToken.deleteMany({});
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
  await app.close();
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
  await prisma.socialAccount.deleteMany({});
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.mobileVerificationToken.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
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
});

describe('Client Operations V1 - Social Accounts', () => {
  it('records metadata, rejects credential keys, and enforces platform immutability', async () => {
    const agency = await seedOrgUser('sa-agency1', 'OWNER');
    const client = await onboardedClient('sa-client1');
    await linkAgency(client, agency);

    const created = await http
      .post(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        platform: 'INSTAGRAM',
        handle: '@socialops',
        profileUrl: 'https://instagram.com/socialops',
      });
    expect(created.status).toBe(201);
    expect(created.body.platform).toBe('INSTAGRAM');
    expect(created.body.platformAccountId).toBeNull();
    expect(created.body.isActive).toBe(true);
    // the response cannot contain a credential-shaped key of any kind
    for (const key of Object.keys(created.body as Record<string, unknown>)) {
      expect(key).not.toMatch(/token|secret|password|oauth|scope/i);
    }

    // a token-shaped key is REJECTED (not silently stripped)
    const withToken = await http
      .post(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ platform: 'FACEBOOK', accessToken: 'nope' });
    expect(withToken.status).toBe(400);

    // an out-of-scope platform is rejected (X is not a V1 platform)
    const outOfScope = await http
      .post(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ platform: 'X' });
    expect(outOfScope.status).toBe(400);

    // client self-service sees its own row and can add another
    const clientList = await http
      .get('/api/client/me/social-accounts')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientList.status).toBe(200);
    expect(clientList.body).toHaveLength(1);

    const clientCreated = await http
      .post('/api/client/me/social-accounts')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ platform: 'YOUTUBE', handle: '@channel' });
    expect(clientCreated.status).toBe(201);

    // duplicate (clientId, platform, platformAccountId) -> 409, not a 500
    const dup = await http
      .post(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ platform: 'FACEBOOK', platformAccountId: 'FB-1' });
    expect(dup.status).toBe(201);
    const dupAgain = await http
      .post(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ platform: 'FACEBOOK', platformAccountId: 'FB-1' });
    expect(dupAgain.status).toBe(409);
    expect(dupAgain.body.code).toBe('DUPLICATE_SOCIAL_ACCOUNT');

    // platform is immutable (D10)
    const platformChange = await http
      .patch(
        `/api/clients/${client.clientId}/social-accounts/${created.body.id as string}`,
      )
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ platform: 'FACEBOOK' });
    expect(platformChange.status).toBe(400);

    // metadata update succeeds
    const updated = await http
      .patch(
        `/api/clients/${client.clientId}/social-accounts/${created.body.id as string}`,
      )
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ displayName: 'SocialOps HQ', isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.displayName).toBe('SocialOps HQ');
    expect(updated.body.isActive).toBe(false);
  }, 30000);

  it('isolates social accounts across Agencies and Clients', async () => {
    const agencyA = await seedOrgUser('sa-agencyA', 'OWNER');
    const agencyB = await seedOrgUser('sa-agencyB', 'OWNER');
    const clientA = await onboardedClient('sa-clientA');
    await linkAgency(clientA, agencyA);

    const created = await http
      .post(`/api/clients/${clientA.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agencyA.accessToken}`)
      .set('X-Organization-Id', agencyA.orgId)
      .send({ platform: 'FACEBOOK', handle: '@a' });
    expect(created.status).toBe(201);

    // Agency B holds no ACTIVE relationship with client A -> uniform 404
    const crossAgency = await http
      .get(`/api/clients/${clientA.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agencyB.accessToken}`)
      .set('X-Organization-Id', agencyB.orgId);
    expect(crossAgency.status).toBe(404);

    // a non-owner user addressing someone else's Client is refused by the guard
    const stranger = await registerClientUser('sa-stranger');
    const strangerAttempt = await http
      .get('/api/client/me/social-accounts')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', clientA.clientId);
    expect(strangerAttempt.status).toBe(403);

    // ...and cannot read a single account either
    const strangerSingle = await http
      .get(`/api/client/me/social-accounts/${created.body.id as string}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', clientA.clientId);
    expect(strangerSingle.status).toBe(403);

    // an unknown social-account id inside a legitimate scope is a 404
    const unknown = await http
      .get(`/api/clients/${clientA.clientId}/social-accounts/${randomUUID()}`)
      .set('Authorization', `Bearer ${agencyA.accessToken}`)
      .set('X-Organization-Id', agencyA.orgId);
    expect(unknown.status).toBe(404);
  }, 30000);
});

describe('Client Operations V1 - Content workflows', () => {
  it('walks DRAFT -> review -> changes -> resubmit -> Final Confirmation, hashing the approved text', async () => {
    const agency = await seedOrgUser('ct-agency1', 'OWNER');
    const client = await onboardedClient('ct-client1');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const title = `Story ${runTag}`;
    const body = 'First draft body';

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title, body });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.finalConfirmedAt).toBeNull();
    const contentId = created.body.id as string;

    // a status cannot be smuggled in at creation
    const withStatus = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'x', body: 'y', status: 'APPROVED' });
    expect(withStatus.status).toBe(400);

    // agency submits for review
    const submitted = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW', note: 'ready for review' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe('IN_REVIEW');

    // client requests changes (client-owner-only review decision)
    const changes = await http
      .post(`/api/client/me/content/${contentId}/status`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ to: 'CHANGES_REQUESTED', note: 'tighten the opening' });
    expect(changes.status).toBe(201);
    expect(changes.body.status).toBe('CHANGES_REQUESTED');

    // agency edits the requested text and resubmits
    const editedBody = 'Second draft body';
    const edited = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: editedBody });
    expect(edited.status).toBe(200);

    const resubmitted = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });
    expect(resubmitted.status).toBe(201);
    expect(resubmitted.body.status).toBe('IN_REVIEW');

    // FINAL CONFIRMATION (client owner only)
    const confirmed = await http
      .post(`/api/client/me/content/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ note: 'approved by owner' });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('APPROVED');
    expect(confirmed.body.finalConfirmedAt).not.toBeNull();
    expect(confirmed.body.finalConfirmedByUserId).toBe(client.id);
    expect(confirmed.body.finalConfirmedRevisionId).not.toBeNull();

    // the confirmed revision carries the SHA-256 of the exact approved text
    const revisions = await http
      .get(`/api/client/me/content/${contentId}/revisions`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(revisions.status).toBe(200);
    const newest = revisions.body[0] as { contentHash: string; id: string };
    expect(newest.id).toBe(confirmed.body.finalConfirmedRevisionId);
    expect(newest.contentHash).toBe(sha256Hex(`${title}\n${editedBody}`));

    // the append-only trail records the review decisions and the confirmation
    const events = await http
      .get(`/api/clients/${client.clientId}/content/${contentId}/status-events`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(events.status).toBe(200);
    const approval = (events.body as Array<Record<string, unknown>>).find(
      (event) => event.toStatus === 'APPROVED',
    );
    expect(approval).toBeDefined();
    expect(approval?.fromStatus).toBe('IN_REVIEW');
    expect(approval?.actorRole).toBe('CLIENT_OWNER');

    // a second confirmation is refused
    const again = await http
      .post(`/api/client/me/content/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_CONFIRMED');
  }, 40000);

  it('keeps APPROVED unreachable for the Agency and clears a confirmation on edit (D7)', async () => {
    const agency = await seedOrgUser('ct-agency2', 'OWNER');
    const member = await seedOrgUser('ct-agency2-member', 'MEMBER');
    const otherAgency = await seedOrgUser('ct-agency3', 'OWNER');
    const client = await onboardedClient('ct-client2');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'Guard story', body: 'Body' });
    expect(created.status).toBe(201);
    const contentId = created.body.id as string;

    // MEMBER cannot mutate (RoleGuard + @RequireMinimumRole('ADMIN'))
    const memberAttempt = await http
      .post(base)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .set('X-Organization-Id', member.orgId)
      .send({ title: 'nope', body: 'nope' });
    expect(memberAttempt.status).toBe(403);

    // another Agency cannot see the item at all (uniform 404)
    const crossAgency = await http
      .get(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${otherAgency.accessToken}`)
      .set('X-Organization-Id', otherAgency.orgId);
    expect(crossAgency.status).toBe(404);

    // the generic status route refuses APPROVED (schema-level bound)
    const approvedAttempt = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'APPROVED' });
    expect(approvedAttempt.status).toBe(400);

    // ...and the Agency has NO final-confirmation route at all
    const agencyConfirm = await http
      .post(`${base}/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({});
    expect(agencyConfirm.status).toBe(404);

    // confirmation requires IN_REVIEW (a DRAFT cannot be approved)
    const premature = await http
      .post(`/api/client/me/content/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});
    expect(premature.status).toBe(409);
    expect(premature.body.code).toBe('INVALID_CONTENT_STATUS');

    // submit, then the Agency may NOT request changes (client-owner-only review)
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });
    const agencyReview = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'CHANGES_REQUESTED' });
    expect(agencyReview.status).toBe(403);
    expect(agencyReview.body.code).toBe('TRANSITION_NOT_PERMITTED_FOR_ACTOR');

    // editing while IN_REVIEW is rejected (D4)
    const editUnderReview = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'sneaky change' });
    expect(editUnderReview.status).toBe(409);
    expect(editUnderReview.body.code).toBe('CONTENT_UNDER_REVIEW');

    // client confirms, then the Agency edits an APPROVED item: D7 revert
    const confirmed = await http
      .post(`/api/client/me/content/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('APPROVED');

    const revert = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'post-approval change' });
    expect(revert.status).toBe(200);
    expect(revert.body.status).toBe('DRAFT');
    expect(revert.body.finalConfirmedAt).toBeNull();
    expect(revert.body.finalConfirmedByUserId).toBeNull();
    expect(revert.body.finalConfirmedRevisionId).toBeNull();

    // a stale expectedRevision is a conflict (D5) - checked while editable
    const staleEdit = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'conflict', expectedRevision: 99 });
    expect(staleEdit.status).toBe(409);
    expect(staleEdit.body.code).toBe('CONTENT_REVISION_CONFLICT');

    // the revert is audited
    const events = await http
      .get(`${base}/${contentId}/status-events`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    const revertEvent = (events.body as Array<Record<string, unknown>>).find(
      (event) => event.fromStatus === 'APPROVED' && event.toStatus === 'DRAFT',
    );
    expect(revertEvent).toBeDefined();
    expect(revertEvent?.actorRole).toBe('AGENCY_ADMIN');

    // archive, then editing is refused
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'ARCHIVED' });
    const archivedEdit = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'nope' });
    expect(archivedEdit.status).toBe(409);
    expect(archivedEdit.body.code).toBe('CONTENT_ARCHIVED');
  }, 60000);
});

describe('Client Operations V1 - RawData intake (insert-only)', () => {
  it('computed the integrity hash server-side and refuses foreign links', async () => {
    const agency = await seedOrgUser('rd-agency1', 'OWNER');
    const client = await onboardedClient('rd-client1');
    const otherClient = await onboardedClient('rd-client2');
    await linkAgency(client, agency);

    // client intake of extracted text
    const rawText = 'raw intake payload';
    const created = await http
      .post('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({
        source: 'CLIENT_FORM',
        extractedText: rawText,
        metadata: { channel: 'instagram' },
        mimeType: 'text/plain',
      });
    expect(created.status).toBe(201);
    // the hash is computed from the exact payload, not accepted from input
    expect(created.body.contentHash).toBe(sha256Hex(rawText));
    expect(created.body.clientId).toBe(client.clientId);
    // storageRef is never written in this phase (S3 deferred)
    expect(created.body).not.toHaveProperty('storageRef');

    // a caller-supplied hash is rejected outright
    const withHash = await http
      .post('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ source: 'CLIENT_UPLOAD', extractedText: 'x', contentHash: 'forged' });
    expect(withHash.status).toBe(400);

    // metadata-only intake is hashed from the JSON payload
    const metaOnly = await http
      .post('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ source: 'EXTERNAL_IMPORT', metadata: { a: 1 } });
    expect(metaOnly.status).toBe(201);
    expect(metaOnly.body.contentHash).toBe(sha256Hex(JSON.stringify({ a: 1 })));

    // agency intake into the SAME client (both actors may record raw data)
    const agencyCreated = await http
      .post(`/api/clients/${client.clientId}/raw-data`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ source: 'AGENCY_UPLOAD', extractedText: 'agency note' });
    expect(agencyCreated.status).toBe(201);

    // linking to another Client's Content is a uniform 404
    const otherContent = await http
      .post('/api/client/me/content')
      .set('Authorization', `Bearer ${otherClient.accessToken}`)
      .set('X-Client-Id', otherClient.clientId)
      .send({ title: 'other', body: 'other body' });
    expect(otherContent.status).toBe(201);

    const foreignLink = await http
      .post('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({
        source: 'CLIENT_UPLOAD',
        contentId: otherContent.body.id as string,
        extractedText: 'x',
      });
    expect(foreignLink.status).toBe(404);

    // an unknown source value is rejected
    const badSource = await http
      .post('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ source: 'WEB_SCRAPE', extractedText: 'x' });
    expect(badSource.status).toBe(400);

    // insert-only: no update or delete route exists anywhere
    const patchAttempt = await http
      .patch(`/api/client/me/raw-data/${created.body.id as string}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ extractedText: 'mutate' });
    expect(patchAttempt.status).toBe(404);

    const deleteAttempt = await http
      .delete(`/api/client/me/raw-data/${created.body.id as string}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(deleteAttempt.status).toBe(404);

    // the records are tenant-scoped on read
    const list = await http
      .get('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);

    const strangerList = await http
      .get('/api/client/me/raw-data')
      .set('Authorization', `Bearer ${otherClient.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(strangerList.status).toBe(403);
  }, 40000);
});