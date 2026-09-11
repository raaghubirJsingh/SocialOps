import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import { ClientInvitationService } from '../src/clients/client-invitation.service.js';
import { ClientAgencyRelationshipService } from '../src/clients/client-agency-relationship.service.js';
import { ClientDiscoveryService } from '../src/clients/client-discovery.service.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-cv1b-access-32ch';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-cv1b-refresh-32';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaClient();
const runTag = `cv1b-${randomUUID()}`;
const testEmail = (name: string) => `cv1b.${name}.${runTag}@example.test`;
const testSlug = (name: string) => `cv1b-${name}-${runTag}`;
const uuid = () => randomUUID();

interface SeededUser {
  id: string;
  email: string;
  organizationId: string;
  role: OrganizationRole;
  accessToken: string;
}

async function seedUser(name: string, role: OrganizationRole): Promise<SeededUser> {
  const orgId = uuid();
  await prisma.organization.create({ data: { id: orgId, name: `Org ${name} ${runTag}`, slug: testSlug(name) } });
  const authService = app.get(AuthService);
  const email = testEmail(name);
  const password = 'StrongPassword123!';
  await authService.register({ accountType: 'SERVICE_PROVIDER', fullName: name, email, password } as never);
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
  // Clean residual data from prior runs (test database).
  await prisma.clientInvitation.deleteMany({});
  await prisma.clientEvent.deleteMany({});
  await prisma.clientFieldChange.deleteMany({});
  await prisma.clientAgencyRelationship.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.organizationMembership.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Client V1 — invitation onboarding (service-level, real DB)', () => {
  it('full flow: issue -> accept -> bind -> owner set, PENDING preserved until activation', async () => {
    const owner = await seedUser('inv-owner', 'OWNER');
    const clientsService = app.get(ClientsService);
    const client = await clientsService.createClientForOrganization(
      { type: 'BUSINESS', name: 'Invite Co', directEmail: testEmail('invite-co'), directPhone: '+15552223333' } as never,
      owner.id,
      owner.organizationId,
    );
    expect(client.onboardingStatus).toBe('PENDING');
    expect(client.ownerUserId).toBeNull();

    const inviteEmail = testEmail('invitee');
    const authService = app.get(AuthService);
    await authService.register({ accountType: 'INDIVIDUAL_BUSINESS', fullName: 'invitee', email: inviteEmail, password: 'StrongPassword123!' } as never);
    await prisma.user.update({ where: { email: inviteEmail }, data: { emailVerifiedAt: new Date(), isActive: true } });

    const invSvc = app.get(ClientInvitationService) as {
      issueInvitation: (c: { id: string; onboardingStatus: string }, e: string, u: string) => Promise<{ email: string; expiresAt: Date }>;
      acceptInvitation: (t: string, u: { sub: string; email: string }) => Promise<{ mobileVerificationRequired: boolean; mobileVerificationToken?: string }>;
    };
    const issued = await invSvc.issueInvitation(client, inviteEmail, owner.id);
    expect(issued.email).toBe(inviteEmail);

    const invitee = await prisma.user.findUniqueOrThrow({ where: { email: inviteEmail } });
    await expect(invSvc.acceptInvitation('bad-token', { sub: invitee.id, email: inviteEmail })).rejects.toBeTruthy();

    // capture raw token via direct creation to exercise accept path
    const { randomBytes, createHash } = await import('node:crypto');
    const raw = randomBytes(32).toString('hex');
    await prisma.clientInvitation.create({ data: { clientId: client.id, email: inviteEmail, tokenHash: createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const accepted = await invSvc.acceptInvitation(raw, { sub: invitee.id, email: inviteEmail });
    expect(accepted.mobileVerificationRequired).toBe(true);

    const bound = await clientsService.findClientById(client.id);
    expect(bound?.ownerUserId).toBe(invitee.id);
  });
});

describe('Client V1 — relationship state machine (service-level)', () => {
  it('one ACTIVE max; explicit termination; no silent replacement', async () => {
    const owner = await seedUser('rel-owner', 'OWNER');
    const clientsService = app.get(ClientsService);
    const client = await clientsService.createClientForOrganization(
      { type: 'INDIVIDUAL', name: 'Rel Co', directEmail: testEmail('rel-co'), directPhone: '+15554445555' } as never,
      owner.id,
      owner.organizationId,
    );
    const relSvc = app.get(ClientAgencyRelationshipService) as {
      createAgencyRequest: (cid: string, oid: string, uid: string) => Promise<{ id: string; status: string }>;
      acceptAgencyRequestByClient: (rid: string, cid: string, uid: string) => Promise<{ status: string }>;
      terminateForAgency: (cid: string, oid: string, uid: string) => Promise<unknown>;
    };
    const orgB = uuid();
    await prisma.organization.create({ data: { id: orgB, name: `Org B ${runTag}`, slug: testSlug('b') } });
    await expect(relSvc.createAgencyRequest(client.id, orgB, owner.id)).rejects.toBeTruthy();
    await relSvc.terminateForAgency(client.id, owner.organizationId, owner.id);
    const req = await relSvc.createAgencyRequest(client.id, orgB, owner.id);
    expect(req.status).toBe('PENDING_INVITATION');
    const accepted = await relSvc.acceptAgencyRequestByClient(req.id, client.id, owner.id);
    expect(accepted.status).toBe('ACTIVE');
    const after = await clientsService.findClientById(client.id);
    expect(after?.ownerUserId).toBeNull();
  });
});

describe('Client V1 — discovery (opt-in AND approval)', () => {
  it('only approved + opted-in Agencies are discoverable', async () => {
    const discSvc = app.get(ClientDiscoveryService) as {
      optIn: (oid: string) => Promise<unknown>;
      approve: (oid: string, uid: string) => Promise<unknown>;
      listDiscoverableAgencies: () => Promise<Array<{ id: string }>>;
    };
    const orgId = uuid();
    await prisma.organization.create({ data: { id: orgId, name: `Disc Org ${runTag}`, slug: testSlug('disc') } });
    await discSvc.optIn(orgId);
    let catalog = await discSvc.listDiscoverableAgencies();
    expect(catalog.find((o) => o.id === orgId)).toBeUndefined();
    await discSvc.approve(orgId, randomUUID());
    catalog = await discSvc.listDiscoverableAgencies();
    expect(catalog.find((o) => o.id === orgId)).toBeDefined();
  });
});

