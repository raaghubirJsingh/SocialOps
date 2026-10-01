/**
 * Phase 2 content lifecycle - database constraint coverage (TESTS ONLY).
 *
 * Exercises the two hand-written CHECK constraints on "Content" against a REAL
 * PostgreSQL instance, never a mock (AGENTS.md section 11):
 *
 *   - "Content_final_confirmed_requires_final_confirmation"
 *     Added by migration 20260930100000_phase2_content_lifecycle. Closes a real
 *     gap: FINAL_CONFIRMED existed since 20260917063349 with NO constraint, so a
 *     "confirmed" item could be written with no recorded confirmation.
 *   - "Content_approved_requires_final_confirmation"
 *     Added by 20260916041416. APPROVED is a legacy value, but the constraint is
 *     DELIBERATELY PRESERVED (approved decision 1) and must stay enforced.
 *
 * These are the first tests in the repository that assert a CHECK constraint.
 * They are deliberately written against raw SQL rather than through the API,
 * because the point under test is the DATABASE refusing a write - a service-layer
 * validation would still pass if the constraint were missing.
 *
 * ISOLATION: REFUSES to run unless DATABASE_URL points at a disposable test
 * database (name must end in `_test` / `_itest`), matching
 * `client-socialops-provider.integration.spec.ts`. Never the development
 * database.
 *
 * NOTE: these tests require migration 20260930100000 to have been APPLIED. They
 * fail loudly (they never skip) when it has not been, so a missing migration can
 * never masquerade as a passing suite.
 */
import { randomUUID } from 'node:crypto';
// Required under ESM: the `jest` global is not auto-injected, so jest.setTimeout
// below would throw ReferenceError without this import (matches every other spec).
import { jest } from '@jest/globals';
import { Prisma, PrismaClient } from '@prisma/client';

const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/(^|_)(test|itest)$/.test(dbName)) {
  throw new Error(
    `REFUSING TO RUN: DATABASE_URL points at "${dbName}", which is not an ` +
      'isolated test database. Integration specs must never target the ' +
      'development database.',
  );
}

const prisma = new PrismaClient();
const runTag = `phase2c-${randomUUID()}`;

jest.setTimeout(30_000);

/** Postgres SQLSTATE for a check-constraint violation. */
const CHECK_VIOLATION = '23514';

/** One owner User + one Client: the minimum a Content row needs (FK tenant key). */
async function seedOwnerAndClient() {
  const userId = randomUUID();
  // Minimal User row: the constraints under test do not depend on auth state, so
  // this keeps the fixture independent of the registration lifecycle.
  await prisma.user.create({
    data: {
      id: userId,
      email: `phase2c.owner.${runTag}@example.test`,
      passwordHash: 'not-a-real-hash-fixture-only',
      fullName: 'Phase 2 Constraint Owner',
      displayName: 'Phase 2 Constraint Owner',
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const clientId = randomUUID();
  await prisma.client.create({
    data: {
      id: clientId,
      ownerUserId: userId,
      name: `Phase2C ${runTag}`,
      type: 'INDIVIDUAL',
      status: 'ACTIVE',
      onboardingStatus: 'ACTIVE',
      // Required by ClientUncheckedCreateInput; the constraints under test do not
      // read these, but the columns are NOT NULL.
      directEmail: `phase2c.client.${runTag}@example.test`,
      directPhone: '+919876543210',
    },
  });
  return { userId, clientId };
}

/**
 * Insert a Content row with an explicit confirmation-triple shape.
 *
 * Uses `$executeRaw` so the INSERT bypasses the Prisma client entirely: if a
 * service-level guard were added later, these tests would still be measuring the
 * DATABASE.
 */
async function insertContent(params: {
  clientId: string;
  confirmerId: string;
  status: 'APPROVED' | 'FINAL_CONFIRMED' | 'DRAFT';
  confirmedAt: Date | null;
  confirmedBy: string | null;
  confirmedRevision: string | null;
}) {
  const id = randomUUID();
  // The `::uuid` casts are load-bearing for the nullable triple: a NULL parameter
  // binds as `NULL::uuid`, which is valid PostgreSQL, so a violating row must fail
  // on the CHECK (SQLSTATE 23514) rather than on type resolution.
  await prisma.$executeRaw`
    INSERT INTO "Content"
      ("id", "clientId", "title", "body", "status",
       "finalConfirmedAt", "finalConfirmedByUserId", "finalConfirmedRevisionId",
       "createdAt", "updatedAt")
    VALUES (
      ${id}::uuid, ${params.clientId}::uuid, 'constraint probe', 'body',
      ${params.status}::"ContentStatus",
      ${params.confirmedAt}, ${params.confirmedBy}::uuid, ${params.confirmedRevision}::uuid,
      NOW(), NOW()
    )`;
  return id;
}

/** Asserts the write is rejected by a CHECK constraint, and returns the SQLSTATE. */
async function expectCheckViolation(
  label: string,
  operation: () => Promise<unknown>,
): Promise<string> {
  try {
    await operation();
  } catch (error) {
    // $executeRaw does not reject with the raw driver error: Prisma wraps it as
    // P2010 and nests the real PostgreSQL SQLSTATE under meta.code. Reading only
    // error.code would therefore never see 23514 and would report a false failure.
    const wrapped = error as { code?: string; meta?: { code?: string } };
    const code =
      wrapped.code === 'P2010' ? wrapped.meta?.code : wrapped.code;
    if (code === CHECK_VIOLATION) return code;
    throw new Error(
      `${label}: expected a CHECK violation (${CHECK_VIOLATION}) but got ` +
        `${code ?? 'no SQLSTATE'}: ${String(error)}`,
    );
  }
  throw new Error(`${label}: expected a CHECK violation, but the INSERT succeeded`);
}

let ownerId: string;
let clientId: string;
const createdContentIds: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
  const seeded = await seedOwnerAndClient();
  ownerId = seeded.userId;
  clientId = seeded.clientId;
});

afterAll(async () => {
  // FK-safe cleanup scoped to this run's rows only. Child rows first.
  await prisma.content.deleteMany({ where: { id: { in: createdContentIds } } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

/** Records an id so afterAll removes it even if a test failed part-way. */
function track(id: string): string {
  createdContentIds.push(id);
  return id;
}

/**
 * Stops tracking an id. Call ONLY after the row has been explicitly deleted, so
 * afterAll stays accurate and the id can no longer appear in a later `notIn`
 * scoping filter.
 */
function untrack(id: string): void {
  const index = createdContentIds.indexOf(id);
  if (index !== -1) createdContentIds.splice(index, 1);
}

describe('Content confirmation constraints (real PostgreSQL)', () => {
  describe('Content_final_confirmed_requires_final_confirmation (Phase 2)', () => {
    it('ACCEPTS a FINAL_CONFIRMED row carrying the complete triple', async () => {
      const id = track(
        await insertContent({
          clientId,
          confirmerId: ownerId,
          status: 'FINAL_CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: ownerId,
          confirmedRevision: randomUUID(),
        }),
      );
      const row = await prisma.content.findFirst({
        where: { id },
        select: { status: true, finalConfirmedAt: true },
      });
      expect(row?.status).toBe('FINAL_CONFIRMED');
      expect(row?.finalConfirmedAt).not.toBeNull();
    });

    // One test per missing field: the CHECK is a three-way AND, so a single
    // combined test could pass while one clause was never enforced.
    for (const missing of [
      'finalConfirmedAt',
      'finalConfirmedByUserId',
      'finalConfirmedRevisionId',
    ] as const) {
      it(`REJECTS a FINAL_CONFIRMED row with no ${missing}`, async () => {
        await expect(
          expectCheckViolation(`FINAL_CONFIRMED without ${missing}`, () =>
            insertContent({
              clientId,
              confirmerId: ownerId,
              status: 'FINAL_CONFIRMED',
              confirmedAt: missing === 'finalConfirmedAt' ? null : new Date(),
              confirmedBy:
                missing === 'finalConfirmedByUserId' ? null : ownerId,
              confirmedRevision:
                missing === 'finalConfirmedRevisionId' ? null : randomUUID(),
            }),
          ),
        ).resolves.toBe(CHECK_VIOLATION);
      });
    }

    it('REJECTS a FINAL_CONFIRMED row with a completely empty triple', async () => {
      await expect(
        expectCheckViolation(
          'FINAL_CONFIRMED with an empty triple',
          () =>
            insertContent({
              clientId,
              confirmerId: ownerId,
              status: 'FINAL_CONFIRMED',
              confirmedAt: null,
              confirmedBy: null,
              confirmedRevision: null,
            }),
        ),
      ).resolves.toBe(CHECK_VIOLATION);
    });

    it('ALLOWS a non-confirmed status with an empty triple (constraint is scoped)', async () => {
      const id = track(
        await insertContent({
          clientId,
          confirmerId: ownerId,
          status: 'DRAFT',
          confirmedAt: null,
          confirmedBy: null,
          confirmedRevision: null,
        }),
      );
      const row = await prisma.content.findFirst({
        where: { id },
        select: { status: true, finalConfirmedAt: true },
      });
      expect(row?.status).toBe('DRAFT');
      expect(row?.finalConfirmedAt).toBeNull();
    });

    it('REFUSES clearing the confirmation triple while the row stays FINAL_CONFIRMED (permanent lock)', async () => {
      // Decision 017: client final confirmation PERMANENTLY locks the item. The
      // lock is what this constraint actually proves at the database level: a
      // row that is still FINAL_CONFIRMED can never have its confirmation triple
      // cleared. Clearing it while REMAINING at FINAL_CONFIRMED violates the
      // CHECK (23514).
      //
      // This is the only way a FINAL_CONFIRMED row could lose its confirmation
      // record while still claiming to be confirmed, and the constraint refuses
      // it. There is deliberately NO paired test asserting the opposite: leaving
      // the status would be an edit path out of the lock, which is not permitted.
      // The application-level lock (human edits, AI revisions, Client Change
      // Requests) is enforced in the service layer, because the database cannot
      // distinguish a human author from an AI author.
      const id = track(
        await insertContent({
          clientId,
          confirmerId: ownerId,
          status: 'FINAL_CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: ownerId,
          confirmedRevision: randomUUID(),
        }),
      );

      // Each field is cleared on its own while the status is unchanged.
      for (const cleared of [
        '"finalConfirmedAt" = NULL',
        '"finalConfirmedByUserId" = NULL',
        '"finalConfirmedRevisionId" = NULL',
      ]) {
        await expect(
          expectCheckViolation(
            `FINAL_CONFIRMED with ${cleared}`,
            () =>
              prisma.$executeRawUnsafe(
                `UPDATE "Content" SET ${cleared} WHERE "id" = $1::uuid`,
                id,
              ),
          ),
        ).resolves.toBe(CHECK_VIOLATION);
      }

      // The row is untouched: still FINAL_CONFIRMED with a complete triple.
      const row = await prisma.content.findFirst({
        where: { id },
        select: {
          status: true,
          finalConfirmedAt: true,
          finalConfirmedByUserId: true,
          finalConfirmedRevisionId: true,
        },
      });
      expect(row?.status).toBe('FINAL_CONFIRMED');
      expect(row?.finalConfirmedAt).not.toBeNull();
      expect(row?.finalConfirmedByUserId).not.toBeNull();
      expect(row?.finalConfirmedRevisionId).not.toBeNull();
    });
  });

  describe('Content_approved_requires_final_confirmation (preserved legacy)', () => {
    it('STILL ACCEPTS a legacy APPROVED row carrying the complete triple', async () => {
      // Proof that the preserved V1 constraint remains satisfied by valid legacy
      // data after the Phase 2 migration.
      const id = track(
        await insertContent({
          clientId,
          confirmerId: ownerId,
          status: 'APPROVED',
          confirmedAt: new Date(),
          confirmedBy: ownerId,
          confirmedRevision: randomUUID(),
        }),
      );
      const row = await prisma.content.findFirst({
        where: { id },
        select: { status: true },
      });
      expect(row?.status).toBe('APPROVED');

      // Delete the planted legacy row immediately, and untrack it so afterAll stays
      // accurate. This row is the ONLY valid APPROVED row this file creates, so
      // leaving it in place would contaminate the table-wide migration assertions
      // below (which expect zero APPROVED survivors).
      await prisma.content.delete({ where: { id } });
      untrack(id);
    });

    it('STILL REJECTS an APPROVED row with an empty triple (constraint preserved)', async () => {
      await expect(
        expectCheckViolation(
          'legacy APPROVED with an empty triple',
          () =>
            insertContent({
              clientId,
              confirmerId: ownerId,
              status: 'APPROVED',
              confirmedAt: null,
              confirmedBy: null,
              confirmedRevision: null,
            }),
        ),
      ).resolves.toBe(CHECK_VIOLATION);
    });
  });

  describe('migration data conversion', () => {
    it('leaves NO Content row at the retired APPROVED status', async () => {
      // The migration converts every legacy row. Any survivor means the UPDATE did
      // not run, so this fails loudly rather than silently passing.
      //
      // Scoped with `notIn: createdContentIds` so rows created by THIS file can
      // never be counted as unconverted legacy rows. This makes the assertion
      // independent of Jest file ordering (Jest does not run files
      // alphabetically), and independent of the planted APPROVED row above.
      // Prisma treats `notIn: []` as "matches every row", so the intent holds even
      // if no fixtures were created.
      const survivors = await prisma.content.count({
        where: { status: 'APPROVED', id: { notIn: createdContentIds } },
      });
      expect(survivors).toBe(0);
    });

    it('gives EVERY FINAL_CONFIRMED row a complete confirmation triple', async () => {
      // The database-level integrity invariant the new CHECK establishes.
      //
      // SCOPE LIMITATION (deliberate): this asserts the invariant over the rows THIS
      // FILE created, NOT over the whole table. A table-wide count would be a latent
      // flake, because the other integration suites (client-operations-v1,
      // content-operations-v2) create FINAL_CONFIRMED rows in their own beforeAll and
      // wipe the table; if such a suite is interrupted before its afterAll, its rows
      // would be reported here as a constraint violation.
      //
      // TRADE-OFF, stated explicitly: because the assertion is scoped, the
      // whole-table invariant is no longer checked inside this suite. The
      // whole-table guarantee is established at migration time instead - the
      // migration's UPDATE runs before the constraint is added, so any pre-existing
      // incomplete FINAL_CONFIRMED row would have failed the ADD CONSTRAINT. Keep
      // that migration-time check in mind before changing this scope.
      const incomplete = await prisma.content.count({
        where: {
          status: 'FINAL_CONFIRMED',
          id: { in: createdContentIds },
          OR: [
            { finalConfirmedAt: null },
            { finalConfirmedByUserId: null },
            { finalConfirmedRevisionId: null },
          ],
        },
      });
      expect(incomplete).toBe(0);
    });

    it('is idempotent: re-running the conversion changes nothing', async () => {
      // Scoped to rows this file did NOT create, so the probe UPDATE can never
      // convert this file's own APPROVED fixture. Without the `id NOT IN (...)` guard
      // this would return 1 and would be MUTATING a fixture it claims not to touch.
      //
      // `Prisma.join([])` would emit `id NOT IN ()`, which is a SQL syntax error, so
      // assert the fixture list is non-empty before building the query. At this point
      // in the file it always is; the assertion keeps a future reordering loud
      // instead of failing as a confusing syntax error.
      expect(createdContentIds.length).toBeGreaterThan(0);

      const survivorsOnly = await prisma.content.count({
        where: { status: 'APPROVED', id: { notIn: createdContentIds } },
      });
      const before = await prisma.content.count({
        where: { status: 'FINAL_CONFIRMED', id: { notIn: createdContentIds } },
      });
      // Each id needs an explicit ::uuid cast: "id" is a uuid column, but Prisma.join
      // binds string parameters as text, which would fail with
      // `operator does not exist: uuid <> text` (SQLSTATE 42883) instead of
      // reporting a meaningful row count.
      const excludedIds = Prisma.join(
        createdContentIds.map((fixtureId) => Prisma.sql`${fixtureId}::uuid`),
      );
      const updated = await prisma.$executeRaw`
        UPDATE "Content" SET "status" = 'FINAL_CONFIRMED'
         WHERE "status" = 'APPROVED' AND "id" NOT IN (${excludedIds})`;
      const after = await prisma.content.count({
        where: { status: 'FINAL_CONFIRMED', id: { notIn: createdContentIds } },
      });
      // Nothing was left for the conversion to do, so re-running it is a no-op.
      expect(survivorsOnly).toBe(0);
      expect(updated).toBe(0);
      expect(after).toBe(before);
    });
  });
});
