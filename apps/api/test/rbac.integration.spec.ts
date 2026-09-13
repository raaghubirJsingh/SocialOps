/**
 * Stage B7 real-instance integration tests for the RBAC foundation.
 *
 * Rules (AGENTS.md section 11):
 *  - Runs against a REAL PostgreSQL instance via DATABASE_URL - never a
 *    mock.
 *  - Runs against the real Memurai instance (the B5/B6 Redis-compatible
 *    cache) for the modules that need it.
 *  - Failures surface loudly; no skips, no silent fallbacks.
 *
 * Executed via `npm run test:integration --workspace=apps/api`.
 */
import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication, Module, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, type OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RequireMinimumRole } from '../src/rbac/decorators/require-roles.decorator.js';
import { RoleGuard } from '../src/rbac/guards/role.guard.js';

if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-b7-access-secret-32-chars';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-b7-refresh-secret-32-chars';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';

const prisma = new PrismaClient();
const runTag = `stageb7-${randomUUID()}`;
const testEmail = (name: string) => `stageb7.${name}.${runTag}@example.test`;
const testSlug = (name: string) => `stageb7-${name}-${runTag}`;
const testOrgId = () => randomUUID();

/**
 * A small ad-hoc controller that exercises @RequireMinimumRole + RoleGuard
 * end-to-end. It is wired into the same Nest app that hosts the production
 * /memberships route so the integration test can assert the full
 *   JWT -> OrganizationMembership -> RoleGuard
 * pipeline against real PostgreSQL rows.
 */
@Controller('rbac-test')
class RbacTestController {
  @Get('admin')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  adminOnly(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET! })],
  controllers: [RbacTestController],
})
class RbacTestModule {}

let app: INestApplication;
let http: ReturnType<typeof request>;

interface SeededUser {
  id: string;
  email: string;
  organizationId: string;
  organizationSlug: string;
  role: OrganizationRole;
  accessToken: string;
}

async function seedUser(
  name: string,
  role: OrganizationRole,
): Promise<SeededUser> {
  const orgId = testOrgId();

  await prisma.organization.create({
    data: { id: orgId, name: `Org ${name} ${runTag}`, slug: testSlug(name) },
  });

  const authService = app.get(AuthService);
  const email = testEmail(name);
  const password = 'StrongPassword123!';
  await authService.register({
    accountType: 'SERVICE_PROVIDER',
    fullName: `RBAC ${name}`,
    email,
    password,
  });

  // Registration creates an UNVERIFIED user and returns no tokens
  // (approved contract). Mark the seeded user verified directly so login
  // succeeds; RBAC seeding does not exercise the email-verification
  // lifecycle (covered in auth.integration.spec.ts).
  await prisma.user.update({
    where: { email },
    data: { isActive: true, emailVerifiedAt: new Date() },
  });

  const tokens = await authService.login({ email, password });

  const user = await prisma.user.findUnique({ where: { email: testEmail(name) } });
  if (!user) throw new Error(`seeded user not found: ${testEmail(name)}`);

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    create: { userId: user.id, organizationId: orgId, role },
    update: { role },
  });

  return {
    id: user.id,
    email: user.email,
    organizationId: orgId,
    organizationSlug: testSlug(name),
    role,
    accessToken: tokens.accessToken,
  };
}

beforeAll(async () => {
  await prisma.$connect();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule, RbacTestModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  // FK-safe cleanup restricted to this run's rows.
  await app.close();
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: runTag } } });
  await prisma.$disconnect();
});

describe('RBAC foundation (real PostgreSQL + real JWT)', () => {
  it('GET /api/health returns 200 without auth or organization context', async () => {
    const res = await http.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'socialops-api' });
  });

  it('POST /api/auth/register remains accessible without organization context (201)', async () => {
    const res = await http
      .post('/api/auth/register')
      .send({
        email: testEmail('regress-register'),
        password: 'RegisterMe123!',
      });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('POST /api/auth/login remains accessible without organization context (200)', async () => {
    const email = testEmail('regress-login');
    const password = 'LoginMe123!';
    await http.post('/api/auth/register').send({ email, password });

    const res = await http.post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('POST /api/auth/logout requires a valid JWT (401 without) but does NOT require X-Organization-Id (204 with valid token)', async () => {
    // Without bearer -> 401 (JwtAuthGuard short-circuits before the org
    // guard because the route uses @UseGuards(JwtAuthGuard)).
    const unauth = await http
      .post('/api/auth/logout')
      .send({ refreshToken: 'irrelevant' });
    expect(unauth.status).toBe(401);

    // With valid bearer + refresh token + NO X-Organization-Id -> 204
    // (logout is @Public() with respect to the org guard, and the JWT
    // has been verified by JwtAuthGuard).
    const register = await http
      .post('/api/auth/register')
      .send({
        email: testEmail('regress-logout'),
        password: 'LogoutMe123!',
      });
    expect(register.status).toBe(201);

    const res = await http
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${register.body.accessToken}`)
      .send({ refreshToken: register.body.refreshToken });
    expect(res.status).toBe(204);
  });

  it('GET /api/memberships/me - 401 without Authorization', async () => {
    const res = await http
      .get('/api/memberships/me')
      .set('X-Organization-Id', randomUUID());
    expect(res.status).toBe(401);
  });

  it('GET /api/memberships/me - 401 with a garbage bearer token', async () => {
    const res = await http
      .get('/api/memberships/me')
      .set('Authorization', 'Bearer this-is-not-a-real-jwt')
      .set('X-Organization-Id', randomUUID());
    expect(res.status).toBe(401);
  });

  it('GET /api/memberships/me - 400 with a valid JWT but no X-Organization-Id', async () => {
    const user = await seedUser('no-org-header', 'MEMBER');
    const res = await http
      .get('/api/memberships/me')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/X-Organization-Id/);
  });

  it('GET /api/memberships/me - 400 with a malformed X-Organization-Id', async () => {
    const user = await seedUser('malformed-header', 'MEMBER');
    const res = await http
      .get('/api/memberships/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Organization-Id', 'not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/UUID/);
  });

  it('GET /api/memberships/me - 403 when the user is NOT a member of the requested organization', async () => {
    const user = await seedUser('non-member', 'MEMBER');
    const foreignOrgId = testOrgId();
    await prisma.organization.create({
      data: {
        id: foreignOrgId,
        name: `Foreign Org ${runTag}`,
        slug: testSlug('foreign'),
      },
    });

    const res = await http
      .get('/api/memberships/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Organization-Id', foreignOrgId);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not a member/i);
  });

  it('GET /api/memberships/me - 200 with only the caller\'s own membership row, not the row of any other user', async () => {
    const member = await seedUser('member-ok', 'MEMBER');
    // Create a second user who is also a member of the SAME
    // organization. The response for `member` must not include this
    // other user's row.
    const otherMember = await seedUser('member-other', 'MEMBER');
    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: otherMember.id,
          organizationId: member.organizationId,
        },
      },
      create: {
        userId: otherMember.id,
        organizationId: member.organizationId,
        role: 'ADMIN',
      },
      update: { role: 'ADMIN' },
    });

    const res = await http
      .get('/api/memberships/me')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .set('X-Organization-Id', member.organizationId);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(member.id);

    const rows = res.body.memberships as Array<{
      role: string;
      organization: { id: string; name: string; slug: string };
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('MEMBER');
    expect(rows[0]?.organization.id).toBe(member.organizationId);
    expect(rows[0]?.organization.slug).toBe(member.organizationSlug);
  });

  it('RoleGuard - VIEWER + @RequireMinimumRole("ADMIN") => 403', async () => {
    const viewer = await seedUser('viewer-403', 'VIEWER');
    const res = await http
      .get('/api/rbac-test/admin')
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .set('X-Organization-Id', viewer.organizationId);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/minimum organization role/i);
  });

  it('RoleGuard - ADMIN + @RequireMinimumRole("ADMIN") => 200', async () => {
    const admin = await seedUser('admin-200', 'ADMIN');
    const res = await http
      .get('/api/rbac-test/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', admin.organizationId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('RoleGuard - OWNER + @RequireMinimumRole("ADMIN") => 200 (inclusive minimum)', async () => {
    const owner = await seedUser('owner-200', 'OWNER');
    const res = await http
      .get('/api/rbac-test/admin')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Organization-Id', owner.organizationId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});



