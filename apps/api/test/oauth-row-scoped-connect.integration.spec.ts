/**
 * ROW-SCOPED OAuth connect - integration coverage (TESTS ONLY).
 *
 * Runs against a REAL PostgreSQL (socialops_test) and a REAL Redis, because the
 * defects this pins are exactly the ones a mock cannot see:
 *
 *   1. DUPLICATE ROW. The platform-scoped connect minted a state with no row
 *      reference and the callback upserted on
 *      (clientId, platform, platformAccountId). A row that had not recorded a
 *      platformAccountId stores NULL there, so the composite could not match it
 *      and Prisma CREATED A SECOND ROW. These tests assert the row ID is
 *      preserved, the platformAccountId is written onto THAT row, and the row
 *      count for the client does not move.
 *   2. TENANT ISOLATION. A row id belonging to another client must not be
 *      connectable, and a callback state must not reach another tenant's row.
 *   3. STATE INTEGRITY. A tampered state must fail exactly like a random string.
 *
 * Only the platform adapters' exchangeCode/fetchProfile are stubbed, so NO
 * external platform is contacted and NO real credential exists. Everything else
 * - signing, single-use nonce consumption in Redis, the transaction, the
 * composite unique index - is the real thing.
 *
 * NOTE: run against socialops_test ONLY. Never point this at the dev database.
 */
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { InstagramOAuthProvider } from '../src/social-accounts/oauth/providers/facebook-graph.oauth.js';
import { createActiveUser } from './helpers/active-user.factory.js';
import { readDevConsoleOutbox } from '../src/registration/providers/dev-console.provider.js';

// The state layer refuses to mint/verify without a dedicated secret, and token
// persistence needs a KEK. Test-only literals, set only when the developer has
// not configured their own.
if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-oauthrow-access-32';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-oauthrow-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
if (!process.env.OAUTH_STATE_SECRET)
  process.env.OAUTH_STATE_SECRET = 'integration-oauthrow-state-32';
if (!process.env.PUBLIC_WEB_URL)
  process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
// The adapters call requireClientConfig() when building the authorize URL, so an
// unconfigured platform fails closed with 503 before any state is minted. These
// are TEST-ONLY literals so the handshake can reach the stubbed provider; they
// are never valid credentials for any real platform and never leave this file.
if (!process.env.INSTAGRAM_CLIENT_ID)
  process.env.INSTAGRAM_CLIENT_ID = 'test-instagram-client-id';
if (!process.env.INSTAGRAM_CLIENT_SECRET)
  process.env.INSTAGRAM_CLIENT_SECRET = 'test-instagram-client-secret';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

/** Two-step login: login -> read OTP from dev console -> verify OTP -> tokens. */
async function twoStepLogin(auth: AuthService, email: string, password: string) {
  const step1 = await auth.login({ email, password });
  if ('status' in step1 && step1.status !== 'otp_required') {
    throw new Error(`Expected otp_required, got ${JSON.stringify(step1)}`);
  }
  const outbox = readDevConsoleOutbox();
  const lastMsg = outbox.find((m) => m.channel === 'EMAIL' && m.message.to === email);
  if (!lastMsg) throw new Error(`No OTP message in outbox for ${email}`);
  const match = lastMsg.message.body.match(/login code is (\d{6})/);
  if (!match) throw new Error(`Could not extract OTP from: ${lastMsg.message.body}`);
  const otp = match[1];
  const step2 = await auth.verifyLoginOtp(email, otp);
  if ('status' in step2) throw new Error(`OTP verification failed: ${JSON.stringify(step2)}`);
  return step2;
}

const prisma = new PrismaClient();
const runTag = `oauthrow-${randomUUID()}`;
// Each test seeds real users, and Argon2id (memoryCost 2^16) plus the full
// onboarding + agency-link HTTP flow is legitimately slower than Jest's 5s
// default. The assertion work is unchanged; only the budget is realistic.
jest.setTimeout(60000);
const testEmail = (n: string) => `oauthrow.${n}.${runTag}@example.test`;
const testSlug = (n: string) => `oauthrow-${n}-${runTag}`;
const PASSWORD = 'StrongPassword123!';

let app: INestApplication;
let http: ReturnType<typeof request>;

async function seedAgency(name: string) {
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
    data: { organizationId: orgId, userId: user.id, role: 'OWNER' },
  });
  const login = await twoStepLogin(auth, email, PASSWORD);
  return { id: user.id, email, orgId, accessToken: login.accessToken };
}

async function registerClientUser(name: string) {
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const user = await createActiveUser(prisma, {
    email,
    fullName: name,
    accountType: 'CLIENT',
    password: PASSWORD,
  });
  const login = await twoStepLogin(auth, email, PASSWORD);
  return { id: user.id, email, accessToken: login.accessToken };
}
async function withLogs<T>(fn: () => Promise<T>) {
  const spy = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  try {
    const result = await fn();
    return { result, logs: spy.mock.calls.map((a) => a.map(String).join(' ')) };
  } finally {
    spy.mockRestore();
  }
}

function tokenFromLogs(logs: string[], marker: string): string {
  const line = logs.find((l) => l.includes(marker));
  if (!line) throw new Error('verification token missing from logs');
  const match = line.match(/[0-9a-f]{32,}/i);
  if (!match) throw new Error('no token');
  return match[0];
}

async function onboardedClient(name: string) {
  const user = await registerClientUser(name);
  const start = await withLogs(() =>
    http
      .post('/api/onboarding/start')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        type: 'INDIVIDUAL',
        name: `OR ${name} ${runTag}`,
        directEmail: testEmail(`${name}-direct`),
        directPhone: '+15550009999',
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

/** Create a metadata row with NO platformAccountId - the broken-case fixture. */
async function createUnlinkedRow(clientId: string, platform = 'INSTAGRAM') {
  return prisma.socialAccount.create({
    data: {
      clientId,
      platform: platform as never,
      handle: `@unlinked-${randomUUID().slice(0, 8)}`,
      isActive: true,
      createdByUserId: null,
    },
  });
}

/** Start the row-scoped connect and return the minted state from the URL. */
function startRowConnect(
  token: string,
  orgId: string | null,
  clientId: string,
  socialAccountId: string,
) {
  const req = http
    .get(`/api/clients/${clientId}/social-accounts/${socialAccountId}/connect`)
    .set('Authorization', `Bearer ${token}`);
  if (orgId) req.set('X-Organization-Id', orgId);
  return req;
}

function stateFromAuthorizeUrl(authorizeUrl: string): string {
  const state = new URL(authorizeUrl).searchParams.get('state');
  if (!state) throw new Error('authorize URL carried no state');
  return state;
}

function statusOf(res: request.Response): string | null {
  const location = res.headers.location;
  if (typeof location !== 'string') return null;
  return new URL(location).searchParams.get('status');
}

/**
 * Stub the adapter's network calls. The registry holds singleton instances, so
 * the prototype methods are the interception point shared with the running app.
 */
function stubPlatform(profile: {
  platformAccountId: string;
  displayName?: string;
}) {
  const exchange = jest.fn(async () => ({
    accessToken: 'stub-access-token',
    refreshToken: 'stub-refresh-token',
    expiresIn: 3600,
    scope: 'stub',
  }));
  const fetchProfile = jest.fn(async () => profile);
  const spies = [
    jest
      .spyOn(InstagramOAuthProvider.prototype, 'exchangeCode')
      .mockImplementation(exchange),
    jest
      .spyOn(InstagramOAuthProvider.prototype, 'fetchProfile')
      .mockImplementation(fetchProfile),
  ];
  return {
    calls: { exchange, fetchProfile },
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
beforeAll(async () => {
  await prisma.$connect();
  await prisma.socialAccountCredential.deleteMany({});
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
}, 60000);

afterAll(async () => {
  await app.close();
  await prisma.socialAccountCredential.deleteMany({});
  await prisma.socialAccount.deleteMany({});
  await prisma.clientEvent.deleteMany({});
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
}, 60000);

/** Drive a full handshake: connect start, then callback with a stubbed platform. */
async function runHandshake(
  start: request.Test,
  platform: string,
  profile: { platformAccountId: string; displayName?: string },
) {
  const started = await start;
  expect(started.status).toBe(200);
  const p = stubPlatform(profile);
  try {
    const state = stateFromAuthorizeUrl(started.body.authorizeUrl as string);
    const callback = await http
      .get(`/api/social-accounts/callback/${platform}`)
      .query({ state, code: 'stub-authorization-code' })
      .redirects(0);
    return { callback, status: statusOf(callback), calls: p.calls };
  } finally {
    p.restore();
  }
}
describe('Row-scoped OAuth connect - the existing row is updated, not duplicated', () => {
  it('preserves the SocialAccount id and populates platformAccountId', async () => {
    const agency = await seedAgency('agency-main');
    const client = await onboardedClient('client-main');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    // Fixture sanity: this is exactly the shape that used to duplicate.
    expect(row.platformAccountId).toBeNull();

    const { status } = await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-discovered-abc', displayName: 'Discovered Name' },
    );
    expect(status).toBe('connected');

    // THE assertion: the SAME row, updated.
    const after = await prisma.socialAccount.findUnique({
      where: { id: row.id },
    });
    expect(after?.id).toBe(row.id);
    expect(after?.platformAccountId).toBe('ig-discovered-abc');
    expect(after?.displayName).toBe('Discovered Name');
    expect(after?.platform).toBe('INSTAGRAM');
    expect(after?.clientId).toBe(client.clientId);
  });

  it('creates NO second SocialAccount for the client', async () => {
    const agency = await seedAgency('agency-count');
    const client = await onboardedClient('client-count');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const { status } = await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-count-xyz' },
    );
    expect(status).toBe('connected');

    expect(
      await prisma.socialAccount.count({
        where: { clientId: client.clientId },
      }),
    ).toBe(1);
  });

  it('creates exactly ONE credential, attached to the updated row', async () => {
    const agency = await seedAgency('agency-cred');
    const client = await onboardedClient('client-cred');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-cred-1' },
    );

    const credentials = await prisma.socialAccountCredential.findMany({
      where: { socialAccountId: row.id },
    });
    expect(credentials).toHaveLength(1);
    // The stored token is encrypted, never the raw provider value.
    expect(credentials[0]!.accessTokenCiphertext).not.toBe(
      'stub-access-token',
    );
    expect(credentials[0]!.accessTokenCiphertext.length).toBeGreaterThan(0);
  });
it('reports the account as Connected through the real read API', async () => {
    const agency = await seedAgency('agency-read');
    const client = await onboardedClient('client-read');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const before = await http
      .get(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(
      before.body.find((a: { id: string }) => a.id === row.id).hasCredential,
    ).toBe(false);

    await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-read-1' },
    );

    const after = await http
      .get(`/api/clients/${client.clientId}/social-accounts`)
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    const listed = after.body.find((a: { id: string }) => a.id === row.id);
    expect(listed.hasCredential).toBe(true);
    expect(listed.platformAccountId).toBe('ig-read-1');
    // Still one row on the read surface too - no duplicate appeared.
    expect(after.body).toHaveLength(1);
  });

  it('replaces the credential on reconnect instead of stacking a second one', async () => {
    const agency = await seedAgency('agency-recon');
    const client = await onboardedClient('client-recon');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-recon-1' },
    );
    await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-recon-2' },
    );

    const credentials = await prisma.socialAccountCredential.findMany({
      where: { socialAccountId: row.id },
    });
    expect(credentials).toHaveLength(1);
    const account = await prisma.socialAccount.findUnique({
      where: { id: row.id },
    });
    expect(account?.platformAccountId).toBe('ig-recon-2');
    // Still exactly one row after a full reconnect cycle.
    expect(
      await prisma.socialAccount.count({
        where: { clientId: client.clientId },
      }),
    ).toBe(1);
  });

  it('writes an auditable client event for the row-scoped connection', async () => {
    const agency = await seedAgency('agency-audit');
    const client = await onboardedClient('client-audit');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    await runHandshake(
      startRowConnect(
        agency.accessToken,
        agency.orgId,
        client.clientId,
        row.id,
      ),
      'INSTAGRAM',
      { platformAccountId: 'ig-audit-1' },
    );

    const events = await prisma.clientEvent.findMany({
      where: {
        clientId: client.clientId,
        action: 'social-account.oauth.connected',
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
describe('Row-scoped OAuth connect - tenant isolation and state integrity', () => {
  it('refuses another client’s row with the uniform 404, and mints no state', async () => {
    const agencyA = await seedAgency('agency-iso-a');
    const clientA = await onboardedClient('client-iso-a');
    await linkAgency(clientA, agencyA);
    const rowA = await createUnlinkedRow(clientA.clientId);

    // A second client under a DIFFERENT agency - a real second tenant.
    const agencyB = await seedAgency('agency-iso-b');
    const clientB = await onboardedClient('client-iso-b');
    await linkAgency(clientB, agencyB);

    const res = await startRowConnect(
      agencyB.accessToken,
      agencyB.orgId,
      clientB.clientId,
      rowA.id,
    );

    // Identical to a row that does not exist - no existence leak.
    expect(res.status).toBe(404);
    expect(String(res.body.message)).toBe('Social account not found');
    expect(res.body.authorizeUrl).toBeUndefined();
    // Untouched: no platform id was written onto the victim’s row.
    const untouched = await prisma.socialAccount.findUnique({
      where: { id: rowA.id },
    });
    expect(untouched?.platformAccountId).toBeNull();
  });

  it('refuses a random UUID with the same uniform 404', async () => {
    const agency = await seedAgency('agency-iso-c');
    const client = await onboardedClient('client-iso-c');
    await linkAgency(client, agency);

    const res = await startRowConnect(
      agency.accessToken,
      agency.orgId,
      client.clientId,
      randomUUID(),
    );
    expect(res.status).toBe(404);
    expect(String(res.body.message)).toBe('Social account not found');
  });

  it('rejects a non-UUID row id before any lookup', async () => {
    const agency = await seedAgency('agency-iso-d');
    const client = await onboardedClient('client-iso-d');
    await linkAgency(client, agency);

    const res = await http
      .get(
        `/api/clients/${client.clientId}/social-accounts/not-a-uuid/connect`,
      )
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const agency = await seedAgency('agency-iso-e');
    const client = await onboardedClient('client-iso-e');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const res = await http
      .get(`/api/clients/${client.clientId}/social-accounts/${row.id}/connect`)
      .set('X-Organization-Id', agency.orgId);
    expect(res.status).toBe(401);
  });
it('fails the callback when the row was deleted after the state was minted', async () => {
    const agency = await seedAgency('agency-vanish');
    const client = await onboardedClient('client-vanish');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const started = await startRowConnect(
      agency.accessToken,
      agency.orgId,
      client.clientId,
      row.id,
    );
    expect(started.status).toBe(200);
    const state = stateFromAuthorizeUrl(started.body.authorizeUrl as string);

    // The row disappears between connect start and callback.
    await prisma.socialAccount.delete({ where: { id: row.id } });

    const p = stubPlatform({ platformAccountId: 'ig-should-not-persist' });
    try {
      const callback = await http
        .get('/api/social-accounts/callback/INSTAGRAM')
        .query({ state, code: 'stub-authorization-code' })
        .redirects(0);

      expect(callback.status).toBe(302);
      // Coarse marker - never a stack trace or a database message.
      expect(statusOf(callback)).toBe('oauth_forbidden');
      // No provider exchange happened, so no token was ever obtained.
      expect(p.calls.exchange).not.toHaveBeenCalled();
      expect(
        await prisma.socialAccount.count({
          where: { clientId: client.clientId },
        }),
      ).toBe(0);
    } finally {
      p.restore();
    }
  });

  it('rejects a tampered state without touching any row', async () => {
    const agency = await seedAgency('agency-tamper');
    const client = await onboardedClient('client-tamper');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const started = await startRowConnect(
      agency.accessToken,
      agency.orgId,
      client.clientId,
      row.id,
    );
    const state = stateFromAuthorizeUrl(started.body.authorizeUrl as string);
    // Flip a character in the payload half; the signature no longer matches.
    const dot = state.lastIndexOf('.');
    const body = state.slice(0, dot);
    const tamperedBody = (body[0] === 'a' ? 'b' : 'a') + body.slice(1);

    const p = stubPlatform({ platformAccountId: 'ig-tampered' });
    try {
      const callback = await http
        .get('/api/social-accounts/callback/INSTAGRAM')
        .query({
          state: `${tamperedBody}.${state.slice(dot + 1)}`,
          code: 'stub-authorization-code',
        })
        .redirects(0);

      expect(callback.status).toBe(302);
      expect(statusOf(callback)).toBe('oauth_state_invalid');
      expect(p.calls.exchange).not.toHaveBeenCalled();
      const untouched = await prisma.socialAccount.findUnique({
        where: { id: row.id },
      });
      expect(untouched?.platformAccountId).toBeNull();
    } finally {
      p.restore();
    }
  });
it('refuses to replay a state that already completed a handshake', async () => {
    const agency = await seedAgency('agency-replay');
    const client = await onboardedClient('client-replay');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const started = await startRowConnect(
      agency.accessToken,
      agency.orgId,
      client.clientId,
      row.id,
    );
    const state = stateFromAuthorizeUrl(started.body.authorizeUrl as string);

    const first = stubPlatform({ platformAccountId: 'ig-replay-1' });
    try {
      const ok = await http
        .get('/api/social-accounts/callback/INSTAGRAM')
        .query({ state, code: 'stub-authorization-code' })
        .redirects(0);
      expect(statusOf(ok)).toBe('connected');
    } finally {
      first.restore();
    }

    // Replaying the SAME state must fail: the nonce is single-use.
    const second = stubPlatform({ platformAccountId: 'ig-replay-2' });
    try {
      const replay = await http
        .get('/api/social-accounts/callback/INSTAGRAM')
        .query({ state, code: 'stub-authorization-code' })
        .redirects(0);
      expect(replay.status).toBe(302);
      expect(statusOf(replay)).toBe('oauth_state_invalid');
      expect(second.calls.exchange).not.toHaveBeenCalled();
      // The row still holds the FIRST handshake's identity, not the replayed one.
      const after = await prisma.socialAccount.findUnique({
        where: { id: row.id },
      });
      expect(after?.platformAccountId).toBe('ig-replay-1');
    } finally {
      second.restore();
    }
  });
});
describe('Row-scoped OAuth connect - client self-service persona', () => {
  it('updates the owner’s own row through the X-Client-Id binding', async () => {
    const agency = await seedAgency('agency-self');
    const client = await onboardedClient('client-self');
    await linkAgency(client, agency);
    const row = await createUnlinkedRow(client.clientId);

    const started = await http
      .get(`/api/client/me/social-accounts/${row.id}/connect`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Client-Id', client.clientId);
    expect(started.status).toBe(200);

    const p = stubPlatform({ platformAccountId: 'ig-self-1' });
    try {
      const state = stateFromAuthorizeUrl(started.body.authorizeUrl as string);
      const callback = await http
        .get('/api/social-accounts/callback/INSTAGRAM')
        .query({ state, code: 'stub-authorization-code' })
        .redirects(0);
      expect(statusOf(callback)).toBe('connected');
    } finally {
      p.restore();
    }

    const after = await prisma.socialAccount.findUnique({
      where: { id: row.id },
    });
    expect(after?.platformAccountId).toBe('ig-self-1');
    expect(
      await prisma.socialAccount.count({
        where: { clientId: client.clientId },
      }),
    ).toBe(1);
  });

  it('refuses another client’s row on the self-service route too', async () => {
    const agencyA = await seedAgency('agency-self-a');
    const clientA = await onboardedClient('client-self-a');
    await linkAgency(clientA, agencyA);
    const rowA = await createUnlinkedRow(clientA.clientId);

    const agencyB = await seedAgency('agency-self-b');
    const clientB = await onboardedClient('client-self-b');
    await linkAgency(clientB, agencyB);

    const res = await http
      .get(`/api/client/me/social-accounts/${rowA.id}/connect`)
      .set('Authorization', `Bearer ${clientB.accessToken}`)
      .set('X-Client-Id', clientB.clientId);

    expect(res.status).toBe(404);
    expect(String(res.body.message)).toBe('Social account not found');
    const untouched = await prisma.socialAccount.findUnique({
      where: { id: rowA.id },
    });
    expect(untouched?.platformAccountId).toBeNull();
  });
});

describe('Platform-scoped connect is unchanged (backward compatibility)', () => {
  it('still returns an authorize URL on the original route', async () => {
    const agency = await seedAgency('agency-legacy');
    const client = await onboardedClient('client-legacy');
    await linkAgency(client, agency);

    const res = await http
      .get(
        `/api/clients/${client.clientId}/social-accounts/INSTAGRAM/connect`,
      )
      .set('Authorization', `Bearer ${agency.accessToken}`)
      .set('X-Organization-Id', agency.orgId);

    expect(res.status).toBe(200);
    // The two-segment path must still resolve to the PLATFORM route, not be
    // swallowed by the new row-scoped route and rejected as a malformed uuid.
    const url = new URL(res.body.authorizeUrl as string);
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});