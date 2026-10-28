/**
 * Development seed script for empty Client and EmployeeProfile tables.
 *
 * Creates three development EmployeeProfile records (with associated Users)
 * and three development Client records. All inserts are idempotent — re-running
 * the script will skip records that already exist.
 *
 * INVARIANTS:
 *   - Never modifies or deletes existing records.
 *   - Never touches Organizations (32 existing) or pre-existing Users (5 existing).
 *   - Employee Users are created with accountType = NULL (AGENTS.md §17.1):
 *     the EmployeeProfile row is the discriminator, not AccountType.
 *   - Password hashing uses Argon2id with the same parameters as
 *     src/auth/auth.service.ts (hashPassword).
 *   - Hard-stops in production (NODE_ENV === 'production').
 *
 * Usage:
 *   npm run seed
 *   (or: node --experimental-strip-types prisma/seed.ts)
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Load local .env before PrismaClient init (mirrors src/main.ts pattern).
// Real environment variables always win: loadEnvFile never overrides values
// already present in process.env.
if (process.env.NODE_ENV !== 'production') {
  process.loadEnvFile();
}

const prisma = new PrismaClient();

/**
 * Replicates the dev auto-verify gate from src/auth/dev-auto-verify.ts.
 * Returns true only when AUTH_DEV_AUTO_VERIFY_REGISTER === 'true'
 * AND NODE_ENV !== 'production'.
 */
function isDevAutoVerify(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env['NODE_ENV'] === 'production') return false;
  return env['AUTH_DEV_AUTO_VERIFY_REGISTER'] === 'true';
}

/**
 * Mirrors AuthService.hashPassword (argon2id, same params).
 */
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 2,
  });
}

// ---------------------------------------------------------------------------
// Seed data definitions (clearly marked as development-only fake data)
// ---------------------------------------------------------------------------

const DEV_SEED_PASSWORD = 'DevSeedPassword123!';

const seedEmployees = [
  {
    fullName: 'Dev Employee One',
    email: 'dev-employee-01@example.com',
    phone: '+1-555-1001',
  },
  {
    fullName: 'Dev Employee Two',
    email: 'dev-employee-02@example.com',
    phone: '+1-555-1002',
  },
  {
    fullName: 'Dev Employee Three',
    email: 'dev-employee-03@example.com',
    phone: '+1-555-1003',
  },
];

const seedClients = [
  {
    type: 'BUSINESS' as const,
    name: 'Acme Corporation',
    directEmail: 'acme@example.com',
    directPhone: '+1-555-0100',
    website: 'https://acme.example.com',
    industry: 'Manufacturing',
  },
  {
    type: 'BUSINESS' as const,
    name: 'Beta Retail LLC',
    directEmail: 'beta@example.com',
    directPhone: '+1-555-0200',
    website: 'https://beta.example.com',
    industry: 'Retail',
  },
  {
    type: 'INDIVIDUAL' as const,
    name: 'Gamma Individual',
    directEmail: 'gamma@example.com',
    directPhone: '+1-555-0300',
    website: null,
    industry: null,
  },
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedEmployeesTx(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const autoVerify = isDevAutoVerify();

  for (const emp of seedEmployees) {
    // Idempotency: check by email on the unique User.email column.
    const existing = await prisma.user.findUnique({
      where: { email: emp.email },
      select: { id: true },
    });

    if (existing) {
      console.log(`  [SKIP] Employee already exists: ${emp.email} (id=${existing.id})`);
      skipped++;
      continue;
    }

    // Mirror registerEmployee (auth.service.ts): create User + EmployeeProfile
    // in a single interactive transaction so there is never an orphan.
    const passwordHash = await hashPassword(DEV_SEED_PASSWORD);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emp.email,
          passwordHash,
          displayName: emp.fullName, // back-compat for employee registration path
          fullName: emp.fullName,
          phone: emp.phone ?? null,
          // Employee accounts carry NO AccountType (AGENTS.md §17.1):
          // the EmployeeProfile row is the discriminator.
          accountType: null,
          isActive: autoVerify,
          emailVerifiedAt: autoVerify ? new Date() : null,
        },
        select: { id: true, email: true },
      });

      await tx.employeeProfile.create({
        data: { userId: user.id },
      });

      return user;
    });

    console.log(`  [CREATE] Employee: ${emp.fullName} <${emp.email}>`);
    created++;
  }

  return { created, skipped };
}

async function seedClientsTx(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const c of seedClients) {
    // Idempotency: Clients have no unique constraint besides id, so use
    // directEmail as a stable natural key.
    const existing = await prisma.client.findFirst({
      where: { directEmail: c.directEmail },
      select: { id: true, name: true },
    });

    if (existing) {
      console.log(`  [SKIP] Client already exists: ${c.directEmail} (id=${existing.id})`);
      skipped++;
      continue;
    }

    await prisma.client.create({
      data: {
        type: c.type,
        name: c.name,
        directEmail: c.directEmail,
        directPhone: c.directPhone,
        website: c.website,
        industry: c.industry,
        // status and onboardingStatus use their @default values (ACTIVE / PENDING)
      },
    });

    console.log(`  [CREATE] Client: ${c.name} (${c.type})`);
    created++;
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Hard-stop guard: never seed production.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed in production (NODE_ENV=production).');
    process.exit(1);
  }

  // Verify database connectivity target is configured.
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting seed.');
    process.exit(1);
  }

  console.log('=== SocialOps Dev Seed ===');
  console.log(`Database: ${process.env.DATABASE_URL.split('@')[0].replace('postgresql://', 'postgresql://****@')}`);
  console.log(`Dev auto-verify gate: ${isDevAutoVerify() ? 'ON' : 'OFF'}`);

  // --- Pre-seed counts ---
  const [orgCountBefore, userCountBefore] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
  ]);
  console.log(`Pre-seed: ${orgCountBefore} organizations, ${userCountBefore} users`);

  // --- Seed Employees ---
  console.log('\n--- Seeding Employees ---');
  const empResult = await seedEmployeesTx();

  // --- Seed Clients ---
  console.log('\n--- Seeding Clients ---');
  const cliResult = await seedClientsTx();

  // --- Post-seed counts ---
  const [empCount, clientCount] = await Promise.all([
    prisma.employeeProfile.count(),
    prisma.client.count(),
  ]);
  console.log('\n=== Seed Complete ===');
  console.log(`Employees: created=${empResult.created}, skipped=${empResult.skipped}, total=${empCount}`);
  console.log(`Clients:   created=${cliResult.created}, skipped=${cliResult.skipped}, total=${clientCount}`);
  console.log(`Organizations: ${orgCountBefore} (unchanged)`);
  console.log(`Users: ${userCountBefore} before + ${empResult.created} new = ${userCountBefore + empResult.created} total`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
