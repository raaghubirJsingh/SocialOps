import { createHash, randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { OrganizationProvisioningService } from '../src/memberships/organization-provisioning.service.js';

/**
 * Service Provider tenant provisioning integration tests.
 *
 * Runs against a real PostgreSQL instance (the same `socialops` database
 * the application connects to). Rows are cleaned up by runTag.
 *
 * Follows the existing integration test pattern: services are directly
 * instantiated (no AppModule) for speed and reliability.
 */
process.loadEnvFile();

if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-provisioning-access-secret-32-chars';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-provisioning-refresh-secret-32-chars';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';

// Enable dev auto-verify so registered users are immediately active + verified
// (same approach as the existing auth.integration.spec.ts)
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
process.env.BOOT_ARTIFACTS_ALLOWED = 'true';

const prisma = new PrismaService();
const jwtService = new JwtService();
const organizationProvisioning = new OrganizationProvisioningService(prisma);
const authService = new AuthService(prisma, jwtService, organizationProvisioning);

const runTag = `provisioning-${randomUUID()}`;
const testEmail = (name: string) => `${name}.${runTag}@example.test`;

async function registerUser(opts: {
  email: string;
  fullName: string;
  accountType: 'SERVICE_PROVIDER' | 'INDIVIDUAL_BUSINESS';
}) {
  // Suppress the verification URL log noise during registration
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  try {
    await authService.register({
      email: opts.email,
      password: 'Password123!',
      fullName: opts.fullName,
      accountType: opts.accountType,
    });
  } finally {
    logSpy.mockRestore();
  }
  const user = await prisma.user.findUnique({
    where: { email: opts.email },
    select: { id: true },
  });
  return user!;
}

async function cleanup() {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organization: { slug: { contains: runTag } } },
    select: { id: true },
  });
  if (memberships.length > 0) {
    await prisma.organizationMembership.deleteMany({
      where: { id: { in: memberships.map((m) => m.id) } },
    });
  }
  await prisma.organization.deleteMany({
    where: { slug: { contains: runTag } },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: runTag } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Service Provider tenant provisioning (integration)', () => {
  it('provisions exactly one Organization + OWNER membership for a Service Provider on login', async () => {
    const email = testEmail('sp-once');
    const user = await registerUser({ email, fullName: 'Solo Provider', accountType: 'SERVICE_PROVIDER' });

    await authService.login({ email, password: 'Password123!' });

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('OWNER');
    expect(memberships[0].organization.name).toBe("Solo Provider's organization");
    expect(memberships[0].organization.slug).toMatch(/^solo-provider-/);
  });

  it('is idempotent: repeated login does not create duplicate Organizations or memberships', async () => {
    const email = testEmail('sp-idempotent');
    const user = await registerUser({ email, fullName: 'Idempotent Provider', accountType: 'SERVICE_PROVIDER' });

    await authService.login({ email, password: 'Password123!' });
    await authService.login({ email, password: 'Password123!' });
    await authService.login({ email, password: 'Password123!' });

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
    });

    expect(memberships).toHaveLength(1);
  });

  it('does not provision a tenant for Individual / Business users', async () => {
    const email = testEmail('individual-no-provision');
    const user = await registerUser({ email, fullName: 'Just a Person', accountType: 'INDIVIDUAL_BUSINESS' });

    await authService.login({ email, password: 'Password123!' });

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
    });

    expect(memberships).toHaveLength(0);
  });

  it('provisions a tenant that is visible through the memberships query (equivalent to GET /api/memberships/me)', async () => {
    const email = testEmail('sp-memberships-me');
    const user = await registerUser({ email, fullName: 'Memberships Me Provider', accountType: 'SERVICE_PROVIDER' });

    const loginResult = await authService.login({ email, password: 'Password123!' });
    expect(loginResult.accessToken).toBeTruthy();

    // The /memberships/me endpoint performs this exact Prisma query
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('OWNER');
    expect(memberships[0].organization.name).toBe("Memberships Me Provider's organization");
  });

  it('keeps different Service Providers isolated', async () => {
    const emailA = testEmail('sp-isolated-a');
    const emailB = testEmail('sp-isolated-b');
    const userA = await registerUser({ email: emailA, fullName: 'Provider A', accountType: 'SERVICE_PROVIDER' });
    const userB = await registerUser({ email: emailB, fullName: 'Provider B', accountType: 'SERVICE_PROVIDER' });

    await authService.login({ email: emailA, password: 'Password123!' });
    await authService.login({ email: emailB, password: 'Password123!' });

    const membershipsA = await prisma.organizationMembership.findMany({
      where: { userId: userA.id },
      include: { organization: true },
    });
    const membershipsB = await prisma.organizationMembership.findMany({
      where: { userId: userB.id },
      include: { organization: true },
    });

    expect(membershipsA).toHaveLength(1);
    expect(membershipsB).toHaveLength(1);
    expect(membershipsA[0].organizationId).not.toBe(membershipsB[0].organizationId);
  });
});
