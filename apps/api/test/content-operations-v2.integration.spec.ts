/**
 * Content Operations - Phase 2 integration coverage (TESTS ONLY).
 *
 * Closes the integration gaps identified in the Content Creation audit. The
 * companion spec `client-operations-v1.integration.spec.ts` already pins the
 * V1 content lifecycle (CRUD, review, D4/D5/D7 edit rules, Final Confirmation
 * to APPROVED, RawData intake) and the tenant-isolation negatives. This file
 * covers ONLY what that spec does not exercise, so nothing is duplicated:
 *
 *   1. the Phase 2 3-scenario pipeline and the FINAL_CONFIRMED lock (the only
 *      door to the immutable state, plus its immutability consequences);
 *   2. Change Requests: creation, listing on both scopes, the SCENARIO_1 cap
 *      of 2, and the immutable-status gate;
 *   3. Internal Notes: agency creation/listing and - most importantly - a
 *      real HTTP assertion that a Client response never carries `agencyId` or
 *      `internalNotes` (the query-level + interceptor boundary);
 *   4. AI task dispatch through the HTTP boundary (isBot + MEMBER
 *      re-verification, the FINAL_CONFIRMED revision gate), executed against
 *      the deterministic mock LLM so the suite never needs a provider key;
 *   5. Client self-service listing/detail and cross-client access denial.
 *
 * ISOLATION: this spec REFUSES to run unless DATABASE_URL points at a
 * disposable test database (name must end in `_test` / `_itest`), matching the
 * guard already used by `client-socialops-provider.integration.spec.ts`. It
 * never touches the development database.
 */
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
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

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cov2-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cov2-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

/**
 * Pin the AI layer to the deterministic mock, so the suite can never reach a
 * real provider (and can never spend money or assert on non-deterministic
 * output) if a developer happens to have a provider key exported in their
 * shell. `resolveLlmProvider` returns `MockLlmProvider` when no provider name
 * resolves, and `LlmService` reads process.env at construction - i.e. after
 * these lines, because AppModule is only imported (not instantiated) at load.
 */
process.env.LLM_PROVIDER = 'mock';
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const prisma = new PrismaClient();
const runTag = `cov2-${randomUUID()}`;
const testEmail = (n: string) => `cov2.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `cov2-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

// __PART2__

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
 * A CLIENT-scoped actor with an ACTIVE onboarding lifecycle, reached through the
 * real approved flow so `ClientAccessGuard` sees exactly what production sees:
 * a direct User -> Client binding plus onboardingStatus = ACTIVE.
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

/**
 * Establishes an ACTIVE Client <-> Agency relationship through the real flow.
 * A self-registered Client is auto-attached to the SOCIALOPS platform provider
 * at activation (Decision 012/016), so engaging an external Agency is an
 * explicit terminate-then-re-engage - never a silent replacement.
 */
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

/**
 * An AI Employee: a first-class User with isBot = true holding the ordinary
 * MEMBER role in the agency Organization. `isBot` is never authority by itself
 * (AGENTS.md section 7) - AIAgentService re-verifies the membership on every
 * dispatch, which is exactly what this fixture makes testable.
 */
async function seedAiMember(
  name: string,
  agency: { orgId: string },
  skillSpecialization: string | null = 'AI Copywriter',
) {
  const user = await createActiveUser(prisma, {
    email: testEmail(name),
    fullName: name,
    accountType: 'SERVICE_PROVIDER',
    password: PASSWORD,
    isBot: true,
    skillSpecialization,
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: agency.orgId,
      userId: user.id,
      role: 'MEMBER' as OrganizationRole,
    },
  });
  return { id: user.id };
}

/** A bot User that is deliberately NOT a member of the calling Organization. */
async function seedNonMemberBot(name: string) {
  return createActiveUser(prisma, {
    email: testEmail(name),
    fullName: name,
    accountType: 'SERVICE_PROVIDER',
    password: PASSWORD,
    isBot: true,
    skillSpecialization: 'AI Copywriter',
  });
}

beforeAll(async () => {
  await prisma.$connect();
  // Children before parents. ON DELETE CASCADE would cover most of this, but the
  // explicit order keeps the intent obvious and is robust to a future change of
  // the cascade rules. `internalNote` and `changeRequest` are cleaned here
  // because they are the two tables the V1 spec does not create.
  await prisma.internalNote.deleteMany({});
  await prisma.changeRequest.deleteMany({});
  await prisma.contentStatusEvent.deleteMany({});
  await prisma.contentRevision.deleteMany({});
  await prisma.content.deleteMany({});
  await prisma.rawData.deleteMany({});
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
  await prisma.$disconnect();
}, 20000);

describe('Content Phase 2 - 3-scenario pipeline', () => {
  it('lets only the Agency drive the manager pipeline edges and hand off to the Client', async () => {
    const agency = await seedOrgUser('p2-agency', 'OWNER');
    const client = await onboardedClient('p2-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    // Scenario-classified content: `scenarioType` is accepted at creation and is
    // the classification the SCENARIO_1 change-request cap later keys off.
    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        title: 'Launch post',
        body: 'Draft body',
        scenarioType: 'SCENARIO_1',
      });
    expect(created.status).toBe(201);
    const contentId = created.body.id as string;
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.scenarioType).toBe('SCENARIO_1');

    // Agency-only pipeline edge #1: DRAFT -> AWAITING_MANAGER_APPROVAL.
    const toManager = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'AWAITING_MANAGER_APPROVAL' });
    expect(toManager.status).toBe(201);
    expect(toManager.body.status).toBe('AWAITING_MANAGER_APPROVAL');

    // The Client is not an Organization member and has no organization context to
    // send, so the global OrganizationMembershipGuard refuses the agency-scoped
    // route at step 3 (missing `X-Organization-Id`) - a 400 that fails closed
    // BEFORE any tenant lookup. The authority matrix is therefore never even
    // reached from this side.
    const clientApproves = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });
    expect(clientApproves.status).toBe(400);

    // The Client's OWN route is reachable, and the authority matrix then refuses
    // the manager-approval edge because only AGENCY_ADMIN may perform it.
    const clientSelfApproves = await http
      .post(`/api/client/me/content/${contentId}/status`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });
    expect(clientSelfApproves.status).toBe(403);
    expect(clientSelfApproves.body.code).toBe(
      'TRANSITION_NOT_PERMITTED_FOR_ACTOR',
    );

    // Agency-only pipeline edge #2: manager approval hands off to the Client.
    const toClient = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });
    expect(toClient.status).toBe(201);
    expect(toClient.body.status).toBe('UNDER_CLIENT_REVIEW');

    // The Agency has NO lock route: FINAL_CONFIRMED is client-only, exactly like
    // APPROVED. An Agency token on the client-scoped route is refused at the
    // organization-context layer (no verified membership for this user/org
    // pairing), which is a fail-closed 400 rather than a route-existence 404.
    const agencyLock = await http
      .post(`/api/client/me/content/${contentId}/final-confirmed-lock`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({});
    expect(agencyLock.status).toBe(400);
  }, 40000);

  it('lets the Client owner return an item to the manager and send it back', async () => {
    const agency = await seedOrgUser('p2-return-agency', 'OWNER');
    const client = await onboardedClient('p2-return-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'Return flow', body: 'Body' });
    const contentId = created.body.id as string;

    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'AWAITING_MANAGER_APPROVAL' });
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });

    // CLIENT_OWNER-only edge: the Client sends the draft back to the manager.
    const returned = await http
      .post(`/api/client/me/content/${contentId}/status`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ to: 'AWAITING_MANAGER_APPROVAL' });
    expect(returned.status).toBe(201);
    expect(returned.body.status).toBe('AWAITING_MANAGER_APPROVAL');

    // The Agency re-submits after the rework.
    const resubmitted = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });
    expect(resubmitted.status).toBe(201);
    expect(resubmitted.body.status).toBe('UNDER_CLIENT_REVIEW');
  }, 40000);
});

describe('Content Phase 2 - FINAL_CONFIRMED lock and immutability', () => {
  /** Drives one item to UNDER_CLIENT_REVIEW (the only state the lock accepts). */
  async function itemUnderClientReview(tag: string) {
    const agency = await seedOrgUser(`${tag}-agency`, 'OWNER');
    const client = await onboardedClient(`${tag}-client`);
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'Lock me', body: 'Frozen text' });
    expect(created.status).toBe(201);
    const contentId = created.body.id as string;

    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'AWAITING_MANAGER_APPROVAL' });
    const handed = await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'UNDER_CLIENT_REVIEW' });
    expect(handed.body.status).toBe('UNDER_CLIENT_REVIEW');

    return { agency, client, base, contentId };
  }

  it('locks at FINAL_CONFIRMED with an atomic triple and freezes the text', async () => {
    const { client, contentId } = await itemUnderClientReview('lock');

    const locked = await http
      .post(`/api/client/me/content/${contentId}/final-confirmed-lock`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ note: 'locked by owner' });
    expect(locked.status).toBe(201);
    expect(locked.body.status).toBe('FINAL_CONFIRMED');
    expect(locked.body.finalConfirmedAt).not.toBeNull();
    expect(locked.body.finalConfirmedByUserId).toBe(client.id);
    expect(locked.body.finalConfirmedRevisionId).not.toBeNull();

    // The triple is a real, readable immutable snapshot of the exact text.
    const revisions = await http
      .get(`/api/client/me/content/${contentId}/revisions`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(revisions.status).toBe(200);
    const frozen = revisions.body[0] as {
      id: string;
      contentHash: string;
      body: string;
    };
    expect(frozen.id).toBe(locked.body.finalConfirmedRevisionId);
    expect(frozen.body).toBe('Frozen text');
    expect(frozen.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // The audit trail records the lock with the CLIENT_OWNER actor.
    const events = await http
      .get(`/api/client/me/content/${contentId}/status-events`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    const lockEvent = (events.body as Array<Record<string, unknown>>).find(
      (e) => e.toStatus === 'FINAL_CONFIRMED',
    );
    expect(lockEvent).toBeDefined();
    expect(lockEvent?.fromStatus).toBe('UNDER_CLIENT_REVIEW');
    expect(lockEvent?.actorRole).toBe('CLIENT_OWNER');

    // A second lock is refused: no silent re-snapshot of an immutable item.
    const relock = await http
      .post(`/api/client/me/content/${contentId}/final-confirmed-lock`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});
    expect(relock.status).toBe(409);
    expect(relock.body.code).toBe('CONTENT_LOCKED');
  }, 40000);

  it('refuses every edit and change request once locked, for both actors', async () => {
    const { agency, client, base, contentId } = await itemUnderClientReview(
      'frozen',
    );

    await http
      .post(`/api/client/me/content/${contentId}/final-confirmed-lock`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});

    // Agency edit refused.
    const agencyEdit = await http
      .patch(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'agency tamper' });
    expect(agencyEdit.status).toBe(409);
    expect(agencyEdit.body.code).toBe('CONTENT_LOCKED');

    // Client-owner edit refused too.
    const ownerEdit = await http
      .patch(`/api/client/me/content/${contentId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ body: 'owner tamper' });
    expect(ownerEdit.status).toBe(409);
    expect(ownerEdit.body.code).toBe('CONTENT_LOCKED');

    // A change request could never be honoured, so it is a business-rule refusal.
    const changeRequest = await http
      .post(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ requestDetails: 'too late' });
    expect(changeRequest.status).toBe(400);
    expect(changeRequest.body.code).toBe('CONTENT_IMMUTABLE');

    // The frozen text is genuinely unchanged in PostgreSQL - the refused edits
    // wrote nothing.
    const row = await prisma.content.findFirst({
      where: { id: contentId },
      select: { status: true, body: true },
    });
    expect(row?.status).toBe('FINAL_CONFIRMED');
    expect(row?.body).toBe('Frozen text');
  }, 40000);
});

describe('Content Phase 2 - Change Requests', () => {
  it('creates, lists on both scopes, and enforces the SCENARIO_1 cap of 2', async () => {
    const agency = await seedOrgUser('cr-agency', 'OWNER');
    const client = await onboardedClient('cr-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        title: 'Capped story',
        body: 'Body',
        scenarioType: 'SCENARIO_1',
      });
    const contentId = created.body.id as string;
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });

    // The Client raises the first request.
    const first = await http
      .post(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ requestDetails: 'Tighten the opening' });
    expect(first.status).toBe(201);
    expect(first.body.requestDetails).toBe('Tighten the opening');
    // requestedById is the authenticated Client owner - never taken from input.
    expect(first.body.requestedById).toBe(client.id);

    // ...and the second (the last one SCENARIO_1 allows).
    const second = await http
      .post(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ requestDetails: 'Shorten the CTA' });
    expect(second.status).toBe(201);

    // The third is refused by the LOCKED cap of 2.
    const third = await http
      .post(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ requestDetails: 'One more please' });
    expect(third.status).toBe(400);
    expect(third.body.code).toBe('CHANGE_REQUEST_LIMIT_EXCEEDED');

    // Exactly two rows exist - the refused insert wrote nothing.
    const count = await prisma.changeRequest.count({ where: { contentId } });
    expect(count).toBe(2);

    // The Agency sees the same two rows, newest first.
    const agencyList = await http
      .get(`${base}/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(agencyList.status).toBe(200);
    expect(agencyList.body).toHaveLength(2);
    expect(agencyList.body[0].requestDetails).toBe('Shorten the CTA');

    // ...and so does the requesting Client, on their own scope.
    const clientList = await http
      .get(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientList.status).toBe(200);
    expect(clientList.body).toHaveLength(2);
  }, 40000);

  it('does NOT apply the cap to SCENARIO_2 content', async () => {
    const agency = await seedOrgUser('cr2-agency', 'OWNER');
    const client = await onboardedClient('cr2-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        title: 'Uncapped story',
        body: 'Body',
        scenarioType: 'SCENARIO_2',
      });
    const contentId = created.body.id as string;

    // Three requests on a non-SCENARIO_1 item: the cap must not engage.
    for (const details of ['one', 'two', 'three']) {
      const attempt = await http
        .post(`/api/client/me/content/${contentId}/change-requests`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .set('X-Client-Id', client.clientId)
        .send({ requestDetails: details });
      expect(attempt.status).toBe(201);
    }
    const count = await prisma.changeRequest.count({ where: { contentId } });
    expect(count).toBe(3);
  }, 40000);

  it('refuses a change request on APPROVED content and never lets the Agency raise one', async () => {
    const agency = await seedOrgUser('cr3-agency', 'OWNER');
    const client = await onboardedClient('cr3-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        title: 'Approved story',
        body: 'Body',
        scenarioType: 'SCENARIO_1',
      });
    const contentId = created.body.id as string;
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });
    await http
      .post(`/api/client/me/content/${contentId}/final-confirmation`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({});

    // APPROVED: the machine can only reach ARCHIVED, so a request is a dead end.
    const afterApproval = await http
      .post(`/api/client/me/content/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId)
      .send({ requestDetails: 'after approval' });
    expect(afterApproval.status).toBe(400);
    expect(afterApproval.body.code).toBe('CONTENT_IMMUTABLE');

    // The Agency has no create route for change requests at all (they are
    // CLIENT_OWNER-raised by design).
    const agencyCreate = await http
      .post(`${base}/${contentId}/change-requests`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ requestDetails: 'agency raised' });
    expect(agencyCreate.status).toBe(404);
  }, 40000);
});

describe('Content Phase 2 - Internal Notes and the Client data boundary', () => {
  /** Agency + linked Client, with one DRAFT item to annotate. */
  async function withDraft(tag: string) {
    const agency = await seedOrgUser(`${tag}-agency`, 'OWNER');
    const client = await onboardedClient(`${tag}-client`);
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'Annotated', body: 'Body' });
    expect(created.status).toBe(201);
    return { agency, client, base, contentId: created.body.id as string };
  }

  it('lets the Agency create and list internal notes, scoped to the authoring Agency', async () => {
    const { agency, base, contentId } = await withDraft('notes');

    const created = await http
      .post(`${base}/${contentId}/internal-notes`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ body: 'Margins are tight; client usually pushes back here.' });
    expect(created.status).toBe(201);
    // agencyId is the VERIFIED organization, never caller input.
    expect(created.body.agencyId).toBe(agency.orgId);
    // authorId is the authenticated subject.
    expect(created.body.authorId).toBe(agency.id);

    const list = await http
      .get(`${base}/${contentId}/internal-notes`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].body).toContain('Margins are tight');
  }, 40000);

  it('never exposes internal notes or agencyId to the Client over HTTP', async () => {
    const { agency, client, base, contentId } = await withDraft('boundary');

    // Seed several notes so a leak would be unambiguous.
    for (const body of ['internal one', 'internal two', 'internal three']) {
      await http
        .post(`${base}/${contentId}/internal-notes`)
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .set('X-Organization-Id', agency.orgId)
        .send({ body });
    }
    await http
      .post(`${base}/${contentId}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });

    // The Agency's own view legitimately carries both fields.
    const agencyView = await http
      .get(`${base}/${contentId}`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(agencyView.status).toBe(200);
    expect(agencyView.body.agencyId).toBe(agency.orgId);

    // The Client's SINGLE-ITEM read must not carry either field.
    const clientDetail = await http
      .get(`/api/client/me/content/${contentId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientDetail.status).toBe(200);
    expect(clientDetail.body.id).toBe(contentId);
    expect(clientDetail.body).not.toHaveProperty('agencyId');
    expect(clientDetail.body).not.toHaveProperty('internalNotes');

    // The same holds for the Client's LIST read, row by row.
    const clientList = await http
      .get('/api/client/me/content')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientList.status).toBe(200);
    expect(clientList.body.length).toBeGreaterThan(0);
    for (const row of clientList.body as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty('agencyId');
      expect(row).not.toHaveProperty('internalNotes');
    }

    // No Client route exposes the notes thread at all.
    const clientNotes = await http
      .get(`/api/client/me/content/${contentId}/internal-notes`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientNotes.status).toBe(404);

    // The note bodies are genuinely absent from the serialized client payload.
    expect(JSON.stringify(clientDetail.body)).not.toContain('internal one');
    expect(JSON.stringify(clientList.body)).not.toContain('internal two');
  }, 40000);

  it('hides one Agency notes thread from another Agency (agencyId filter)', async () => {
    const { base, contentId } = await withDraft('crossnotes');
    const otherAgency = await seedOrgUser('crossnotes-other', 'OWNER');

    const foreignList = await http
      .get(`${base}/${contentId}/internal-notes`)
      .set('Authorization', `Bearer ${otherAgency.accessToken}`)
      .set('X-Organization-Id', otherAgency.orgId);
    // Uniform 404: the other Agency has no ACTIVE relationship with this Client,
    // so the item is indistinguishable from one that does not exist.
    expect(foreignList.status).toBe(404);
  }, 40000);
});

describe('Content Phase 2 - AI task dispatch over HTTP', () => {
  /**
   * Requires Redis: AiTaskDispatchGuard applies a rate limit and an in-flight
   * SET NX lock before every dispatch, so this test needs the same ephemeral
   * Redis service the rest of the integration suite uses (AGENTS.md section 12).
   */
  it('dispatches to a MEMBER bot, stores a revision under its own id, and refuses non-bots and non-members', async () => {
    const agency = await seedOrgUser('ai-agency', 'OWNER');
    const member = await seedOrgUser('ai-agency-member', 'MEMBER');
    const client = await onboardedClient('ai-client');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    const bot = await seedAiMember('ai-bot', agency);
    const nonMemberBot = await seedNonMemberBot('ai-bot-outsider');

    const created = await http
      .post(base)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ title: 'AI story', body: 'Seed text' });
    const contentId = created.body.id as string;

    // The Agency's own fleet listing returns the bot.
    const fleet = await http
      .get('/api/organizations/ai-members')
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(fleet.status).toBe(200);
    expect(
      (fleet.body as Array<{ id: string }>).some((e) => e.id === bot.id),
    ).toBe(true);

    // A human USER is refused: isBot is required (400).
    const notABot = await http
      .post(`${base}/${contentId}/ai-tasks`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        aiUserId: agency.id,
        prompt: 'Write a headline',
        outputType: 'revision',
      });
    expect(notABot.status).toBe(400);
    expect(notABot.body.code).toBe('AI_USER_REQUIRED');

    // A bot that is NOT a MEMBER of this Organization is refused (403):
    // isBot alone is never authority.
    const outsider = await http
      .post(`${base}/${contentId}/ai-tasks`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        aiUserId: nonMemberBot.id,
        prompt: 'Write a headline',
        outputType: 'revision',
      });
    expect(outsider.status).toBe(403);
    expect(outsider.body.code).toBe('AI_EMPLOYEE_NOT_MEMBER');

    // A MEMBER role in the org cannot dispatch: the route requires ADMIN.
    const memberDispatch = await http
      .post(`${base}/${contentId}/ai-tasks`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .set('X-Organization-Id', member.orgId)
      .send({
        aiUserId: bot.id,
        prompt: 'Write a headline',
        outputType: 'revision',
      });
    expect(memberDispatch.status).toBe(403);

    // The happy path: OWNER dispatches, and the revision is authored by the
    // AI User itself so the audit trail is clean.
    const dispatched = await http
      .post(`${base}/${contentId}/ai-tasks`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        aiUserId: bot.id,
        prompt: 'Write a punchier headline',
        outputType: 'revision',
      });
    expect(dispatched.status).toBe(201);
    expect(dispatched.body.createdByUserId).toBe(bot.id);
    expect(dispatched.body.clientId).toBe(client.clientId);
    // The mock provider ran offline and deterministically.
    expect(dispatched.body.body).toContain('AI-Generated Response');

    // An internal-note output is authored the same way and lands as a note.
    const noted = await http
      .post(`${base}/${contentId}/ai-tasks`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({
        aiUserId: bot.id,
        prompt: 'Assess the tone',
        outputType: 'internal-note',
      });
    expect(noted.status).toBe(201);
    expect(noted.body.agencyId).toBe(agency.orgId);
    expect(noted.body.authorId).toBe(bot.id);

    // The AI-authored note is Agency-only: invisible to the Client.
    const clientNotes = await http
      .get(`/api/client/me/content/${contentId}/internal-notes`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(clientNotes.status).toBe(404);
  }, 40000);
});

describe('Content - Client self-service reads and cross-client isolation', () => {
  it('lists, filters and reads own content, and denies a stranger Client', async () => {
    const agency = await seedOrgUser('read-agency', 'OWNER');
    const client = await onboardedClient('read-client');
    const stranger = await onboardedClient('read-stranger');
    await linkAgency(client, agency);
    const base = `/api/clients/${client.clientId}/content`;

    // Three items, one of which we will move out of DRAFT.
    const titles = ['Story A', 'Story B', 'Story C'];
    const ids: string[] = [];
    for (const title of titles) {
      const created = await http
        .post(base)
        .set('Authorization', `Bearer ${agency.accessToken}`)
        .set('X-Organization-Id', agency.orgId)
        .send({ title, body: `Body of ${title}` });
      expect(created.status).toBe(201);
      ids.push(created.body.id as string);
    }
    await http
      .post(`${base}/${ids[0]}/status`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId)
      .send({ to: 'IN_REVIEW' });

    // The Client sees exactly their own three items, newest first.
    const list = await http
      .get('/api/client/me/content')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(list.status).toBe(200);
    const rows = list.body as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    for (const row of rows) {
      expect(row.clientId).toBe(client.clientId);
    }
    // Newest first, so the first item is the most recently created.
    expect(rows[0].title).toBe('Story C');

    // The status filter narrows the result server-side.
    const drafts = await http
      .get('/api/client/me/content?status=DRAFT')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(drafts.status).toBe(200);
    expect(drafts.body).toHaveLength(2);
    for (const row of drafts.body as Array<Record<string, unknown>>) {
      expect(row.status).toBe('DRAFT');
    }

    const inReview = await http
      .get('/api/client/me/content?status=IN_REVIEW')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(inReview.status).toBe(200);
    expect(inReview.body).toHaveLength(1);
    expect(inReview.body[0].id).toBe(ids[0]);

    // An unknown status is refused rather than silently ignored.
    const bogus = await http
      .get('/api/client/me/content?status=PUBLISHED')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(bogus.status).toBe(400);

    // Single-item read returns the real row.
    const detail = await http
      .get(`/api/client/me/content/${ids[1]}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(ids[1]);
    expect(detail.body.title).toBe('Story B');
    expect(detail.body.body).toBe('Body of Story B');

    // CROSS-CLIENT ISOLATION: a stranger Client cannot read the item by id.
    const crossRead = await http
      .get(`/api/client/me/content/${ids[1]}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', client.clientId);
    // A forged X-Client-Id fails the owner-binding check in ClientAccessGuard,
    // which always throws ForbiddenException - a deterministic 403, never a 404.
    expect(crossRead.status).toBe(403);

    // ...and cannot read it while correctly bound to their OWN client either.
    const strangerBound = await http
      .get(`/api/client/me/content/${ids[1]}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', stranger.clientId);
    expect(strangerBound.status).toBe(404);

    // ...nor can they edit it.
    const strangerEdit = await http
      .patch(`/api/client/me/content/${ids[1]}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', stranger.clientId)
      .send({ body: 'tampered' });
    expect(strangerEdit.status).toBe(404);

    // ...nor transition it.
    const strangerTransition = await http
      .post(`/api/client/me/content/${ids[1]}/status`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', stranger.clientId)
      .send({ to: 'IN_REVIEW' });
    expect(strangerTransition.status).toBe(404);

    // The stranger's own list is empty - they never see the other tenant.
    const strangerList = await http
      .get('/api/client/me/content')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .set('X-Client-Id', stranger.clientId);
    expect(strangerList.status).toBe(200);
    expect(strangerList.body).toHaveLength(0);
  }, 40000);
});
