import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';

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
  accountType: 'SERVICE_PROVIDER' | 'INDIVIDUAL_BUSINESS' = 'SERVICE_PROVIDER',
): Promise<SeededUser> {
  const orgId = uuid();
  await prisma.organization.create({
    data: { id: orgId, name: `Org ${name} ${runTag}`, slug: testSlug(name) },
  });
  const authService = app.get(AuthService);
  const email = testEmail(name);
  const password = 'StrongPassword123!';
  await authService.register({ accountType, fullName: name, email, password } as never);
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date(), isActive: true } });
  const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId, role } });
  const login = await authService.login({ email, password });
  return { id: userId, email, organizationId: orgId, role, accessToken: login.accessToken };
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
  await prisma.organizationMembership.deleteMany({});
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
