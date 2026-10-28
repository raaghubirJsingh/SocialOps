import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { createActiveUser } from './helpers/active-user.factory.js';
import { twoStepLogin } from './shared/two-step-login.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cv1-access-32chars!!';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cv1-refresh-32chars';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `cv1-${randomUUID()}`;
const testEmail = (name: string) => `cv1.${name}.${runTag}@example.test`;
const testSlug = (name: string) => `cv1-${name}-${runTag}`;
const uuid = () => randomUUID();

interface SeededUser {
  id: string;
  email: string;
  organizationId: string;
  role: OrganizationRole;
  accessToken: string;
}

async function seedUser(
  name: string,
  role: OrganizationRole,
  accountType: 'SERVICE_PROVIDER' | 'CLIENT' = 'SERVICE_PROVIDER',
): Promise<SeededUser> {
  const orgId = uuid();
  await prisma.organization.create({
    data: { id: orgId, name: `Org ${name} ${runTag}`, slug: testSlug(name) },
  });
  const auth = app.get(AuthService);
  const email = testEmail(name);
  const password = 'StrongPassword123!';
  // Legacy register is retired (L11): create the active fixture directly.
  const user = await createActiveUser(prisma, { email, fullName: name, accountType, password });
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: user.id, role } });
  const login = await twoStepLogin(auth, email, password);
  return { id: user.id, email, organizationId: orgId, role, accessToken: login.accessToken };
}

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  await prisma.$connect();
  // Clean any residual data from prior test runs (test database).
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.loginOtpChallenge.deleteMany({});
  await prisma.organizationMembership.deleteMany({});
  // AdminStepUpChallenge / AdminStepUpSession reference User with
  // onDelete: Restrict, so they must be cleared BEFORE user.deleteMany()
  // or the FK fires (observed: AdminStepUpChallenge_userId_fkey).
  await prisma.adminStepUpChallenge.deleteMany({});
  await prisma.adminStepUpSession.deleteMany({});
  await prisma.user.deleteMany({});
  const orgCount = await prisma.organization.count();
  console.log('DIAG_ORG_COUNT_BEFORE_CLEANUP', orgCount);
  await prisma.organization.deleteMany({});
  const orgs = await prisma.organization.findMany({ select: { slug: true } });
  console.log('DIAG_EXISTING_SLUGS', JSON.stringify(orgs.map((o) => o.slug)));
  console.log('DIAG_RUNTAG', runTag);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
}, 120_000);

afterAll(async () => {
  await app.close();
  // Clear ACT-2 Client tables (FK: ClientAgencyRelationship -> Organization; Client -> ClientAgencyRelationship) before users/orgs.
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.loginOtpChallenge.deleteMany({});
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.organizationMembership.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: runTag } } });
  await prisma.$disconnect();
});

describe('Client V1 — Agency CRUD + scoping', () => {
  let owner: SeededUser;
  beforeAll(async () => {
    owner = await seedUser('owner-a', 'OWNER');
  });

  it('Agency creates a PENDING/unbound Client', async () => {
    const res = await http
      .post('/api/clients')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Organization-Id', owner.organizationId)
      .send({ type: 'INDIVIDUAL' as const, name: 'Acme Client', directEmail: testEmail('acme'), directPhone: '+15551112222' });
    expect(res.status).toBe(201);
    expect(res.body.client.onboardingStatus).toBe('PENDING');
    expect(res.body.client.ownerUserId).toBeNull();
  });

  it('Agency sees only its own Clients (no cross-Agency leakage)', async () => {
    const other = await seedUser('owner-b', 'OWNER');
    const list = await http
      .get('/api/clients')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Organization-Id', owner.organizationId);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    for (const c of list.body) expect(c.name).toBe('Acme Client');
    const otherList = await http
      .get('/api/clients')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .set('X-Organization-Id', other.organizationId);
    expect(otherList.status).toBe(200);
    expect(otherList.body.length).toBe(0);
  });
});

describe('Client V1 — access control + status authority (locked D1)', () => {
  it('denies unauthenticated routes', async () => {
    expect((await http.get('/api/clients')).status).toBe(401);
    expect((await http.get('/api/client/me')).status).toBe(401);
  });

  it('OWNER can change status; MEMBER denied (403)', async () => {
    const owner = await seedUser('status-owner', 'OWNER');
    const create = await http
      .post('/api/clients')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Organization-Id', owner.organizationId)
      .send({ type: 'INDIVIDUAL', name: 'Status Co', directEmail: testEmail('status-co'), directPhone: '+15553334444' });
    const clientId = create.body.client.id;
    const member = await seedUser('status-member', 'MEMBER');
    await prisma.organizationMembership.create({ data: { organizationId: owner.organizationId, userId: member.id, role: 'MEMBER' } });
    const ok = await http
      .post(`/api/clients/${clientId}/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Organization-Id', owner.organizationId)
      .send({ status: 'SUSPENDED' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('SUSPENDED');
    const denied = await http
      .post(`/api/clients/${clientId}/status`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .set('X-Organization-Id', owner.organizationId)
      .send({ status: 'ACTIVE' });
    expect(denied.status).toBe(403);
  });
});

describe('Client V1 — server-side list search (GET /api/clients?q=)', () => {
  let ownerA: SeededUser;
  let ownerB: SeededUser;

  const getList = (token: string, orgId: string, q?: string) =>
    http
      .get(q === undefined ? '/api/clients' : `/api/clients?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', orgId);

  const createClient = (
    token: string,
    orgId: string,
    body: Record<string, unknown>,
  ) =>
    http
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', orgId)
      .send(body);

  beforeAll(async () => {
    ownerA = await seedUser('search-a', 'OWNER');
    ownerB = await seedUser('search-b', 'OWNER');
    // Agency A: searchable across every supported field.
    await createClient(ownerA.accessToken, ownerA.organizationId, {
      type: 'BUSINESS',
      name: 'Zephyr Holdings',
      directEmail: testEmail('zephyr-contact'),
      directPhone: '+15550001234',
      primaryContactName: 'Priya Raman',
    });
    // Agency B: a term that must NEVER leak into Agency A's results.
    await createClient(ownerB.accessToken, ownerB.organizationId, {
      type: 'INDIVIDUAL',
      name: 'Quorum Secret',
      directEmail: testEmail('quorum'),
      directPhone: '+15550009999',
      primaryContactName: 'Quorum Contact',
    });
  });

  it('matches within the correct agency on every searchable field', async () => {
    const byName = await getList(ownerA.accessToken, ownerA.organizationId, 'zephyr');
    expect(byName.status).toBe(200);
    expect(byName.body.map((c: { name: string }) => c.name)).toContain('Zephyr Holdings');

    const byEmail = await getList(ownerA.accessToken, ownerA.organizationId, 'zephyr-contact');
    expect(byEmail.body.length).toBeGreaterThanOrEqual(1);

    const byPhone = await getList(ownerA.accessToken, ownerA.organizationId, '0001234');
    expect(byPhone.body.length).toBeGreaterThanOrEqual(1);

    const byContact = await getList(ownerA.accessToken, ownerA.organizationId, 'Priya');
    expect(byContact.body.length).toBeGreaterThanOrEqual(1);
  });

  it('matches case-insensitively', async () => {
    const lower = await getList(ownerA.accessToken, ownerA.organizationId, 'zephyr holdings');
    const upper = await getList(ownerA.accessToken, ownerA.organizationId, 'ZEPHYR HOLDINGS');
    expect(lower.body.length).toBe(1);
    expect(upper.body.length).toBe(1);
    expect(lower.body[0].id).toBe(upper.body[0].id);
  });

  it('NEGATIVE: another agency term yields an empty list (no cross-tenant leak)', async () => {
    const res = await getList(ownerA.accessToken, ownerA.organizationId, 'Quorum');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('a TERMINATED relationship is excluded from that agency search', async () => {
    const term = await createClient(ownerA.accessToken, ownerA.organizationId, {
      type: 'INDIVIDUAL',
      name: 'Departing Client',
      directEmail: testEmail('departing'),
      directPhone: '+15550007777',
    });
    const clientId = term.body.client.id;
    const before = await getList(ownerA.accessToken, ownerA.organizationId, 'Departing');
    expect(before.body.length).toBe(1);
    const terminated = await http
      .post(`/api/clients/${clientId}/agency-relationship/terminate`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .set('X-Organization-Id', ownerA.organizationId);
    expect(terminated.status).toBe(201);
    const after = await getList(ownerA.accessToken, ownerA.organizationId, 'Departing');
    expect(after.body.length).toBe(0);
  });

  it('handles wildcard and quote characters literally and rejects >100 chars', async () => {
    // None of these terms appear literally in any seeded field, so a literal
    // (parameterised) contains match returns an EMPTY list. If Prisma treated
    // "%" or "_" as a LIKE wildcard, "%" would match every client (length >= 1)
    // and this assertion would fail - proving the terms are handled literally.
    for (const term of ['%', '_', "O'Brien", '100%"_done', '%%%%']) {
      const res = await getList(ownerA.accessToken, ownerA.organizationId, term);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    }
    const tooLong = await getList(ownerA.accessToken, ownerA.organizationId, 'x'.repeat(101));
    expect(tooLong.status).toBe(400);
  });

  it('empty and whitespace-only q behaves exactly like today (no filter)', async () => {
    const noParam = await getList(ownerA.accessToken, ownerA.organizationId);
    const empty = await getList(ownerA.accessToken, ownerA.organizationId, '');
    const whitespace = await getList(ownerA.accessToken, ownerA.organizationId, '   ');
    expect(empty.status).toBe(200);
    expect(whitespace.status).toBe(200);
    const ids = (body: { id: string }[]) => body.map((c) => c.id).sort();
    expect(ids(empty.body)).toEqual(ids(noParam.body));
    expect(ids(whitespace.body)).toEqual(ids(noParam.body));
  });
});
