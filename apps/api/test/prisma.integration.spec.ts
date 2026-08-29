/**
 * Stage B real-instance integration tests for the Prisma foundation.
 *
 * Rules (AGENTS.md section 11):
 *  - Runs against a REAL PostgreSQL instance via DATABASE_URL - never a mock.
 *  - Failures surface loudly; there are no skips and no silent fallbacks.
 *
 * Executed via `npm run test:integration --workspace=apps/api`
 * (checkpoint B5 locally against the real Windows PostgreSQL instance, and
 * in CI against the ephemeral PostgreSQL service container).
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Unique marker per run so runs never touch each other's rows. */
const runTag = `stageb-${randomUUID()}`;

const testEmail = (name: string): string => `stageb.${name}.${runTag}@example.test`;

async function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
  throw new Error('Expected a P2002 unique-constraint violation, but the operation succeeded');
}

beforeAll(async () => {
  // Fails loudly when DATABASE_URL is missing or the instance is unreachable.
  await prisma.$connect();
});

afterAll(async () => {
  // FK-safe cleanup restricted to this run's rows (test isolation on the
  // dedicated test database - socialops_test in checkpoint B5).
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.workspace.deleteMany({ where: { organization: { slug: { contains: runTag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: runTag } } });
  await prisma.$disconnect();
});

describe('Prisma foundation (real PostgreSQL instance)', () => {
  it('connects and answers a raw query', async () => {
    const result = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`;
    expect(result[0]?.one).toBe(1);
  });

  it('persists the locked tenant model: Organization -> Workspace', async () => {
    const org = await prisma.organization.create({
      data: { name: `Stage B Org ${runTag}`, slug: runTag },
    });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: `Stage B WS ${runTag}`, slug: 'main' },
    });
    expect(workspace.organizationId).toBe(org.id);

    const reloaded = await prisma.organization.findUnique({
      where: { id: org.id },
      include: { workspaces: true },
    });
    expect(reloaded?.workspaces).toHaveLength(1);
    expect(reloaded?.workspaces[0]?.id).toBe(workspace.id);
  });

  it('enforces User email uniqueness', async () => {
    const email = testEmail('unique');
    await prisma.user.create({ data: { email } });
    await expectUniqueViolation(prisma.user.create({ data: { email } }));
  });

  it('enforces Workspace slug uniqueness per Organization but allows reuse across Organizations', async () => {
    const orgA = await prisma.organization.create({
      data: { name: `Org A ${runTag}`, slug: `${runTag}-a` },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Org B ${runTag}`, slug: `${runTag}-b` },
    });

    await prisma.workspace.create({
      data: { organizationId: orgA.id, name: 'A main', slug: 'main' },
    });
    await expectUniqueViolation(
      prisma.workspace.create({
        data: { organizationId: orgA.id, name: 'A main duplicate', slug: 'main' },
      }),
    );

    const workspaceB = await prisma.workspace.create({
      data: { organizationId: orgB.id, name: 'B main', slug: 'main' },
    });
    expect(workspaceB.slug).toBe('main');
  });

  it('attaches roles to OrganizationMembership and defaults to VIEWER (least privilege)', async () => {
    const org = await prisma.organization.create({
      data: { name: `Org M ${runTag}`, slug: `${runTag}-m` },
    });
    const admin = await prisma.user.create({ data: { email: testEmail('admin') } });
    const viewer = await prisma.user.create({ data: { email: testEmail('viewer') } });

    const explicit = await prisma.organizationMembership.create({
      data: { userId: admin.id, organizationId: org.id, role: 'ADMIN' },
    });
    expect(explicit.role).toBe('ADMIN');

    const defaulted = await prisma.organizationMembership.create({
      data: { userId: viewer.id, organizationId: org.id },
    });
    expect(defaulted.role).toBe('VIEWER');

    // One role per user per organization (roles live on the membership).
    await expectUniqueViolation(
      prisma.organizationMembership.create({
        data: { userId: admin.id, organizationId: org.id, role: 'OWNER' },
      }),
    );
  });

  it('supports the same user holding roles in different Organizations', async () => {
    const orgA = await prisma.organization.create({
      data: { name: `Org X ${runTag}`, slug: `${runTag}-x` },
    });
    const orgB = await prisma.organization.create({
      data: { name: `Org Y ${runTag}`, slug: `${runTag}-y` },
    });
    const user = await prisma.user.create({ data: { email: testEmail('multi') } });

    const inA = await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: orgA.id, role: 'OWNER' },
    });
    const inB = await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: orgB.id, role: 'VIEWER' },
    });
    expect(inA.role).toBe('OWNER');
    expect(inB.role).toBe('VIEWER');
  });

  it('stores RefreshToken rows with unique token hashes', async () => {
    const user = await prisma.user.create({ data: { email: testEmail('token') } });
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: `hash-${runTag}`, expiresAt },
    });
    await expectUniqueViolation(
      prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: `hash-${runTag}`, expiresAt },
      }),
    );
  });
});