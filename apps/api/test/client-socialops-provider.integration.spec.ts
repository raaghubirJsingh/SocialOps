/**
 * Automatic attachment of the platform Service Provider at Client activation
 * (Decision 012).
 *
 * Business contract under test: a first-time self-registered Client becomes
 * ACTIVE **and** gains an ACTIVE relationship to the single platform-owned
 * SOCIALOPS Service-Provider Organization, so Instagram / Facebook / YouTube
 * can be connected without joining an external Agency.
 *
 * Properties pinned here:
 *   1. activation is atomic - the Client and its relationship land together;
 *   2. attachment is idempotent - a repeat activation never duplicates a row;
 *   3. the provider is a singleton - exactly one SOCIALOPS Organization;
 *   4. an external-Agency-managed Client is never reassigned to SocialOps;
 *   5. the OAuth start and callback now work for a self-registered Client,
 *      while state forgery, replay and cross-tenant access stay rejected.
 *
 * ISOLATION: this spec REFUSES to run unless DATABASE_URL points at a
 * disposable test database (name must end in `_test` / `_itest`). It never
 * touches the development database.
 */
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import {
  ForbiddenException,
  INestApplication,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import { ClientDiscoveryService } from '../src/clients/client-discovery.service.js';
import { MobileVerificationService } from '../src/clients/mobile-verification.service.js';
import { SocialOpsProviderService } from '../src/clients/social-ops-provider.service.js';
import { OAuthStateService } from '../src/social-accounts/oauth/oauth-state.service.js';
import { SocialAccountsOAuthService } from '../src/social-accounts/oauth/social-accounts-oauth.service.js';
import { createActiveUser } from './helpers/active-user.factory.js';

const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/(^|_)(test|itest)$/.test(dbName)) {
  throw new Error(
    `REFUSING TO RUN: DATABASE_URL points at "${dbName}", which is not an ` +
      'isolated test database. Integration specs must never target the ' +
      'development database.',
  );
}

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-provider-access-32';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-provider-refresh-3';
// The OAuth state layer signs with its OWN dedicated secret (never a JWT
// secret). Without it every connect start is correctly refused.
if (!process.env.OAUTH_STATE_SECRET)
  process.env.OAUTH_STATE_SECRET = 'integration-provider-oauth-state-32';
// Test-only placeholders so the REAL provider adapter can BUILD an authorize URL.
// buildAuthorizeUrl() only concatenates a string - it performs NO network call - so
// literals are sufficient and no real credential is ever used. Same convention as
// the sibling unit spec (social-accounts-oauth.service.spec.ts:20-23). These are
// literals in a test file, never the developer's environment.
//
// The one test that asserts OAUTH_PROVIDER_NOT_CONFIGURED deletes this pair again
// in its own body (and restores it in a finally block), so it still proves the
// fail-closed path and still performs no exchange.
process.env.INSTAGRAM_CLIENT_ID ??= 'test-instagram-client-id';
process.env.INSTAGRAM_CLIENT_SECRET ??= 'test-instagram-client-secret';

/**
 * `startConnectClient()` returns the FULL provider authorizeUrl; the signed
 * state token the platform echoes back to the callback is its `state` query
 * parameter. `OAuthStateService.verify()` expects that token, not the URL.
 *
 * Parsed exactly as a real callback would read it, mirroring the sibling unit
 * spec (social-accounts-oauth.service.spec.ts:275-276).
 */
function stateFrom(authorizeUrl: string): string {
  const value = new URL(authorizeUrl).searchParams.get('state');
  if (!value) throw new Error('authorizeUrl carried no state parameter');
  return value;
}
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `provider-${randomUUID()}`;
const PASSWORD = 'StrongPassword123!';

// The user factory hashes with Argon2id at production cost, and the first
// activation in a file also pays module warm-up. Jest's default 5s per-test
// budget is too tight and makes the suite flaky; this is not a weakened
// assertion, only a realistic time budget.
jest.setTimeout(30_000);

let app: INestApplication;
let http: ReturnType<typeof request>;

/** A fully verified Client user, so activation takes the 1-Click path. */
async function selfRegisteringClient(name: string) {
  const email = `${name}.${runTag}@example.test`;
  const user = await createActiveUser(prisma, {
    email,
    fullName: name,
    accountType: 'CLIENT',
    phone: '+919876543210',
    password: PASSWORD,
  });
  // The persona is captured at registration in production; set it here so the
  // activation resolves from the verified record alone.
  await prisma.user.update({
    where: { id: user.id },
    data: { clientType: 'INDIVIDUAL' },
  });
  const login = await app.get(AuthService).login({ email, password: PASSWORD });
  return { email, accessToken: login.accessToken };
}

async function activate(token: string) {
  return http
    .post('/api/onboarding/start')
    .set('Authorization', `Bearer ${token}`)
    .send({});
}

const relationshipsFor = (clientId: string) =>
  prisma.clientAgencyRelationship.findMany({ where: { clientId } });

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
  const emails = { contains: runTag };
  const clients = await prisma.client.findMany({
    where: { ownerUser: { email: emails } },
    select: { id: true },
  });
  const ids = clients.map((c) => c.id);
  await prisma.clientEvent.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientAgencyRelationship.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.organization.deleteMany({ where: { slug: 'socialops' } });
  await prisma.user.deleteMany({ where: { email: emails } });
  await prisma.$disconnect();
});

describe('first-time self-registration attaches the platform Service Provider', () => {
  it('creates an ACTIVE PLATFORM relationship to the single SOCIALOPS organization', async () => {
    const user = await selfRegisteringClient('attach');
    const res = await activate(user.accessToken);
    expect(res.status).toBe(201);
    expect(res.body.onboardingStatus).toBe('ACTIVE');

    const rels = await relationshipsFor(res.body.clientId);
    expect(rels).toHaveLength(1);
    expect(rels[0].status).toBe('ACTIVE');
    // PLATFORM, not CLIENT (the user never asked) and not AGENCY (SocialOps
    // is explicitly not an external Agency tenant).
    expect(rels[0].initiatedBy).toBe('PLATFORM');

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: rels[0].organizationId },
    });
    expect(org.kind).toBe('SOCIALOPS');
    // Never offered as an external Agency to discover or request.
    expect(org.discoveryOptIn).toBe(false);
  });

  it('provisions exactly ONE SOCIALOPS organization across many activations', async () => {
    await activate((await selfRegisteringClient('second')).accessToken);
    await activate((await selfRegisteringClient('third')).accessToken);

    const providers = await prisma.organization.findMany({
      where: { kind: 'SOCIALOPS' },
    });
    expect(providers).toHaveLength(1);
  });

  it('records the attachment in the client audit trail', async () => {
    const user = await selfRegisteringClient('audited');
    const res = await activate(user.accessToken);
    const events = await prisma.clientEvent.findMany({
      where: {
        clientId: res.body.clientId,
        action: 'agency.relationship.attached',
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({
      source: 'PLATFORM',
      initiatedBy: 'PLATFORM',
    });
  });

  it('never duplicates the relationship when activation is retried', async () => {
    const user = await selfRegisteringClient('retried');
    const first = await activate(user.accessToken);
    expect(first.status).toBe(201);

    const second = await activate(user.accessToken);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CLIENT_ALREADY_BOUND');

    // Idempotent: still exactly one relationship, and no second Client.
    expect(await relationshipsFor(first.body.clientId)).toHaveLength(1);
    expect(
      await prisma.client.count({ where: { ownerUser: { email: user.email } } }),
    ).toBe(1);
  });

  it('leaves no inconsistent records when activation fails', async () => {
    // A verified phone but NO persona: the database cannot build the Client.
    const email = `nopersona.${runTag}@example.test`;
    await createActiveUser(prisma, {
      email,
      fullName: 'No Persona',
      accountType: 'CLIENT',
      phone: '+919876543211',
      password: PASSWORD,
    });
    const login = await app.get(AuthService).login({ email, password: PASSWORD });
    const res = await activate(login.accessToken);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONBOARDING_PROFILE_INCOMPLETE');
    // The transaction rolled back: no Client, and therefore no relationship.
    expect(
      await prisma.client.count({ where: { ownerUser: { email } } }),
    ).toBe(0);
    expect(
      await prisma.clientAgencyRelationship.count({
        where: { client: { ownerUser: { email } } },
      }),
    ).toBe(0);
  });
});


describe('a self-registered Client can drive the OAuth flow', () => {
  it('starts Instagram OAuth and is NOT refused as CLIENT_NOT_MANAGED', async () => {
    const user = await selfRegisteringClient('oauthstart');
    const res = await activate(user.accessToken);
    const clientId = res.body.clientId as string;

    const start = await http
      .get('/api/client/me/social-accounts/INSTAGRAM/connect')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Client-Id', clientId);

    // A GET: the handshake start returns 200 with the signed state. Before
    // this change the same call failed 403 CLIENT_NOT_MANAGED, because no
    // ACTIVE relationship existed to resolve the managing organization.
    expect(start.status).toBe(200);
    expect(start.body.authorizeUrl).toEqual(expect.any(String));
    expect(start.body.authorizeUrl.length).toBeGreaterThan(0);
  });

  it('is reachable at the callback route without a bearer token', async () => {
    const user = await selfRegisteringClient('reachable');
    await activate(user.accessToken);

    // The browser arrives from the platform with NO Authorization header and
    // NO X-Organization-Id. Without @PublicAuth()/@Public() the global
    // JwtAuthGuard refused this with 401 before the controller ever ran, so
    // NOBODY could ever complete a handshake. The response may be a redirect
    // (supertest follows it) - what matters is that the guards did not.
    const cb = await http
      .get('/api/social-accounts/callback/INSTAGRAM')
      .query({ state: 'not-a-real-state', code: 'authorization-code' });
    expect(cb.status).not.toBe(401);
    expect(cb.status).not.toBe(403);
  });

  it('passes callback-time authorization for the authorized Client owner', async () => {
    const user = await selfRegisteringClient('callback');
    const res = await activate(user.accessToken);
    const clientId = res.body.clientId as string;

    const oauth = app.get(SocialAccountsOAuthService);
    const stateSvc = app.get(OAuthStateService);

    // Real signed state, minted through the normal client-side start path,
    // then verified through the real HMAC path the controller uses.
    const { authorizeUrl } = await oauth.startConnectClient(
      clientId,
      'INSTAGRAM',
    );
    const payload = await stateSvc.verify(stateFrom(authorizeUrl));
    expect(payload.clientId).toBe(clientId);
    expect(payload.source).toBe('CLIENT');

    // Reaching the exchange proves the ownership + ACTIVE-relationship
    // re-check PASSED. The exchange then fails only because no live Instagram
    // credential exists in tests - a provider-configuration error, not an
    // authorization error. (Token persistence is connector-layer scope.)
    //
    // The placeholder pair seeded at module load is REMOVED here so this test
    // still exercises the genuine unconfigured path. That also guarantees
    // requireClientConfig() throws before any exchange network call is attempted.
    const savedId = process.env.INSTAGRAM_CLIENT_ID;
    const savedSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    delete process.env.INSTAGRAM_CLIENT_ID;
    delete process.env.INSTAGRAM_CLIENT_SECRET;
    let err: unknown;
    try {
      err = await oauth
        .completeConnect('INSTAGRAM', 'authorization-code', payload)
        .catch((e: unknown) => e);
    } finally {
      // Restore in a finally block so a failing assertion can never leave the
      // module-level pair missing for the tests that follow.
      if (savedId !== undefined) process.env.INSTAGRAM_CLIENT_ID = savedId;
      if (savedSecret !== undefined) {
        process.env.INSTAGRAM_CLIENT_SECRET = savedSecret;
      }
    }
    // A missing credential pair is a SERVICE failure, never an authorization
    // one, so it surfaces as a typed 503 carrying the machine-readable code
    // the UI names. Assert the typed contract, not prose: the human-readable
    // copy is owned by the frontend and may change.
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    const body = (err as ServiceUnavailableException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.code).toBe('OAUTH_PROVIDER_NOT_CONFIGURED');
    expect(body.platform).toBe('INSTAGRAM');
    expect(err).not.toBeInstanceOf(ForbiddenException);
    expect(err).not.toBeInstanceOf(NotFoundException);
  });

  it('rejects a tampered OAuth state', async () => {
    const user = await selfRegisteringClient('tampered');
    const res = await activate(user.accessToken);
    const { authorizeUrl } = await app
      .get(SocialAccountsOAuthService)
      .startConnectClient(res.body.clientId as string, 'INSTAGRAM');

    // The HMAC must not validate: tampering is rejected before any
    // authorization decision is reached.
    await expect(
      app
        .get(OAuthStateService)
        .verify(`${stateFrom(authorizeUrl)}tampered`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a replayed OAuth state', async () => {
    const user = await selfRegisteringClient('replayed');
    const res = await activate(user.accessToken);
    const { authorizeUrl } = await app
      .get(SocialAccountsOAuthService)
      .startConnectClient(res.body.clientId as string, 'INSTAGRAM');

    const stateSvc = app.get(OAuthStateService);
    const state = stateFrom(authorizeUrl);
    await expect(stateSvc.verify(state)).resolves.toBeDefined();
    // Single use: the nonce is consumed on first verification.
    await expect(stateSvc.verify(state)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });


  it('rejects a callback whose state names a Client the actor does not own', async () => {
    const victim = await selfRegisteringClient('victim');
    const victimClient = (await activate(victim.accessToken)).body
      .clientId as string;
    const attacker = await selfRegisteringClient('attacker');
    const attackerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: attacker.email } })
    ).id;

    // A VALIDLY SIGNED state that pairs the ATTACKER with the VICTIM's client.
    // The signature passes (only our server can mint one), so the rejection
    // must come from the callback-time ownership re-check, not the HMAC.
    const forged = await app.get(OAuthStateService).mint({
      sub: attackerId,
      organizationId: (await relationshipsFor(victimClient))[0].organizationId,
      clientId: victimClient,
      platform: 'INSTAGRAM',
      source: 'CLIENT',
    });
    const payload = await app.get(OAuthStateService).verify(forged);

    await expect(
      app
        .get(SocialAccountsOAuthService)
        .completeConnect('INSTAGRAM', 'authorization-code', payload),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reading another Client social accounts', async () => {
    const owner = await selfRegisteringClient('reader');
    const other = await selfRegisteringClient('other');
    const otherClientId = (await activate(other.accessToken)).body
      .clientId as string;
    const own = await activate(owner.accessToken);
    expect(own.status).toBe(201);

    const res = await http
      .get('/api/client/me/social-accounts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Client-Id', otherClientId);

    expect(res.status).toBeGreaterThanOrEqual(400);
    // The intruder learns nothing about the other tenant.
    expect(JSON.stringify(res.body)).not.toContain(otherClientId);
  });
});

describe('external Agency relationships are preserved', () => {
  it('resolves the external Agency and is never reassigned to SocialOps', async () => {
    const user = await selfRegisteringClient('agency');
    const clientId = (await activate(user.accessToken)).body.clientId as string;

    // The Client leaves SocialOps the approved way: explicit termination.
    await prisma.clientAgencyRelationship.updateMany({
      where: { clientId, status: 'ACTIVE' },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    const agency = await prisma.organization.create({
      data: {
        name: `Agency ${runTag}`,
        slug: `agency-${runTag}`,
        kind: 'AGENCY',
        discoveryOptIn: false,
      },
    });
    await prisma.clientAgencyRelationship.create({
      data: {
        clientId,
        organizationId: agency.id,
        status: 'ACTIVE',
        initiatedBy: 'AGENCY',
        startedAt: new Date(),
      },
    });

    // A repeat attach attempt must respect the external relationship and
    // must NOT move the Client back onto the platform provider.
    const resolved = await app
      .get(SocialOpsProviderService)
      .attachIfUnmanaged(prisma, clientId);
    expect(resolved).toBe(agency.id);

    const rels = await relationshipsFor(clientId);
    expect(rels.filter((r) => r.status === 'ACTIVE')).toHaveLength(1);
    expect(rels.find((r) => r.status === 'ACTIVE')?.organizationId).toBe(
      agency.id,
    );
  });
});


/**
 * Legacy-intake activation (POST /onboarding/activate) must reach exactly the
 * same end state as the 1-Click path. This is the regression that motivated
 * the change: the legacy path had its own `client.update` and never called the
 * provider, so those Clients stayed unmanaged and could not connect anything.
 */
describe('legacy-intake activation also attaches the platform Service Provider', () => {
  /** A verified user whose phone is NOT verified, forcing the legacy path. */
  async function legacyUser(name: string) {
    const email = `legacy.${name}.${runTag}@example.test`;
    const user = await createActiveUser(prisma, {
      email,
      fullName: `Legacy ${name}`,
      accountType: 'CLIENT',
      phone: '+919876543299',
      password: PASSWORD,
    });
    // The 1-Click bypass is gated on phoneVerifiedAt; clearing it forces the
    // intake + mobile-OTP path.
    await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: null },
    });
    const login = await app.get(AuthService).login({ email, password: PASSWORD });
    return { email, id: user.id, accessToken: login.accessToken };
  }

  function intake(name: string) {
    return {
      type: 'INDIVIDUAL' as const,
      name: `Legacy ${name} ${runTag}`,
      directEmail: `legacy.${name}.${runTag}@example.test`,
      directPhone: '+15550009999',
    };
  }

  async function startLegacy(token: string, name: string) {
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      const res = await http
        .post('/api/onboarding/start')
        .set('Authorization', `Bearer ${token}`)
        .send(intake(name));
      const line = spy.mock.calls
        .map((a) => a.map(String).join(' '))
        .find((l) => l.includes('Mobile verification token'));
      const tokenMatch = line?.match(/[0-9a-f]{32,}/i);
      return { res, token: tokenMatch ? tokenMatch[0] : null };
    } finally {
      spy.mockRestore();
    }
  }

  it('creates an ACTIVE PLATFORM relationship on legacy activation', async () => {
    const user = await legacyUser('attach');
    const { res, token } = await startLegacy(user.accessToken, 'attach');

    // PENDING first, and deliberately with NO relationship yet.
    expect(res.status).toBe(201);
    expect(res.body.onboardingStatus).toBe('PENDING');
    expect(res.body.mobileVerificationRequired).toBe(true);
    expect(await relationshipsFor(res.body.clientId)).toHaveLength(0);

    expect(token).toEqual(expect.any(String));
    const activated = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token });
    expect(activated.status).toBe(200);

    const rels = await relationshipsFor(res.body.clientId);
    expect(rels).toHaveLength(1);
    expect(rels[0].status).toBe('ACTIVE');
    expect(rels[0].initiatedBy).toBe('PLATFORM');
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: rels[0].organizationId },
    });
    expect(org.kind).toBe('SOCIALOPS');
  });

  it('does not duplicate the relationship when activation is retried', async () => {
    const user = await legacyUser('retry');
    const { res, token } = await startLegacy(user.accessToken, 'retry');
    const clientId = res.body.clientId as string;

    const first = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token });
    expect(first.status).toBe(200);

    // The mobile token is single use, so the retry is refused outright.
    const second = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token });
    expect(second.status).toBe(403);

    // Still exactly one ACTIVE relationship.
    const active = (await relationshipsFor(clientId)).filter(
      (r) => r.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
  });


  it('leaves an Agency-invited Client attached to its Agency, never to SocialOps', async () => {
    const user = await legacyUser('invited');
    const agency = await prisma.organization.create({
      data: {
        name: `Inviting Agency ${runTag}`,
        slug: `inviting-agency-${runTag}`,
        kind: 'AGENCY',
        discoveryOptIn: false,
      },
    });
    const creator = await createActiveUser(prisma, {
      email: `creator.${runTag}@example.test`,
      fullName: 'Creator',
      accountType: 'SERVICE_PROVIDER',
      password: PASSWORD,
    });
    // Agency-side creation already establishes the ACTIVE relationship.
    const client = await app
      .get(ClientsService)
      .createClientForOrganization(
        intake('invited') as never,
        creator.id,
        agency.id,
      );
    expect(await relationshipsFor(client.id)).toHaveLength(1);

    const { rawToken } = await app
      .get(MobileVerificationService)
      .issueVerificationToken(client.id, user.id);
    const activated = await http
      .post('/api/onboarding/activate')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ token: rawToken });
    expect(activated.status).toBe(200);

    const active = (await relationshipsFor(client.id)).filter(
      (r) => r.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    // The Agency keeps the Client: no silent reassignment to SocialOps.
    expect(active[0].organizationId).toBe(agency.id);
    expect(active[0].initiatedBy).toBe('AGENCY');
  });
});

describe('concurrent activation converges on a single provider', () => {
  it('never creates two Clients or two ACTIVE relationships', async () => {
    const user = await selfRegisteringClient('concurrent');

    // Two simultaneous activations of the same account.
    const [a, b] = await Promise.all([
      activate(user.accessToken),
      activate(user.accessToken),
    ]);
    const statuses = [a.status, b.status].sort();
    // Exactly one wins; the other is refused, never a duplicate.
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);

    const clients = await prisma.client.findMany({
      where: { ownerUser: { email: user.email } },
    });
    expect(clients).toHaveLength(1);

    const active = (await relationshipsFor(clients[0].id)).filter(
      (r) => r.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(active[0].initiatedBy).toBe('PLATFORM');
  });
});

describe('the platform Service Provider is never published as an external Agency', () => {
  it('is absent from the catalog and cannot be opted in or approved', async () => {
    const user = await selfRegisteringClient('catalog');
    await activate(user.accessToken);

    const provider = await prisma.organization.findFirstOrThrow({
      where: { kind: 'SOCIALOPS' },
    });
    const discovery = app.get(ClientDiscoveryService);

    // Even if every flag were forced on, the catalog filter excludes it.
    await prisma.organization.update({
      where: { id: provider.id },
      data: { discoveryOptIn: true, discoveryApprovedAt: new Date() },
    });
    const listed = await discovery.listDiscoverableAgencies();
    expect(listed.map((o) => o.id)).not.toContain(provider.id);

    // And the write paths that could publish it are refused.
    await expect(discovery.optIn(provider.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      discovery.approve(provider.id, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      discovery.assertDiscoverable(provider.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The refused approval never wrote an approver.
    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: provider.id },
    });
    expect(after.discoveryApprovedByUserId).toBeNull();
  });
});

