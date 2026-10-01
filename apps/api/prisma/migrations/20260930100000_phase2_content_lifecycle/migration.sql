-- Phase 2 content lifecycle: FINAL_CONFIRMED becomes the active terminal
-- confirmation state and the V1 APPROVED status retires.
--
-- Scope: DATA + CONSTRAINTS only. No column is added, removed, or retyped, and
-- no enum value is created or removed - the Prisma data model is unchanged by
-- this migration (only enum documentation comments were updated in schema.prisma).
--
-- Approved lifecycle decisions implemented here:
--   1. APPROVED is RETAINED as a legacy ContentStatus enum value and its
--      existing CHECK constraint is deliberately PRESERVED. APPROVED is removed
--      from the ACTIVE PHASE 2 status sets, which is a code change and not a
--      schema change.
--      SCOPE BOUNDARY: the pre-existing V1 endpoint
--      POST /api/client/me/content/:contentId/final-confirmation and
--      ContentStatusService.confirmFinal() are PRESERVED UNCHANGED and can
--      still produce an APPROVED row. Retiring that V1 door is a separate,
--      breaking change that is NOT authorized by Decision 017; a row created
--      that way satisfies both CHECK constraints and is unaffected by the
--      permanent FINAL_CONFIRMED lock below, which governs the Phase 2
--      pipeline.
--   2. Client final confirmation PERMANENTLY LOCKS the item. Once a row reaches
--      FINAL_CONFIRMED there is NO edit path out of it: the status machine
--      offers only ARCHIVED, and the confirmation triple is never cleared for
--      such a row. The lock applies to EVERY actor:
--        - Human Managers -> content edits are refused (409 CONTENT_LOCKED)
--        - AI Employees   -> "revision" output is refused (409 CONTENT_LOCKED).
--                            An "internal-note" output stays allowed: a note is
--                            insert-only agency commentary that cannot alter
--                            the confirmed artifact.
--        - Clients        -> new Change Requests are refused
--                            (400 CONTENT_IMMUTABLE)
--      These actor-level restrictions are enforced in APPLICATION CODE, not
--      here: the database cannot distinguish a human author from an AI author,
--      because both write through the same columns.
--   3. FINAL_CONFIRMED requires the complete confirmation triple
--      (at / by / revision). That requirement IS enforced here, below, by the
--      new CHECK constraint - it is the one part of the lock the database can
--      prove on its own.
--
-- Ordering is load-bearing: the data UPDATE below must run BEFORE the new
-- CHECK is added, because it produces the very rows the CHECK then guards.
-- ---------------------------------------------------------------------------

-- 1. Retire legacy V1 approvals.
--
-- SAFETY: every row at APPROVED provably carries all three confirmation fields,
-- because "Content_approved_requires_final_confirmation" has been enforced
-- since 20260916041416_client_operations_v1_metadata and no migration has
-- dropped or weakened it. FINAL_CONFIRMED requires exactly the same triple, so
-- this conversion cannot produce an invalid row.
--
-- The three confirmation fields are DELIBERATELY NOT TOUCHED: the original
-- confirmation timestamp and the revision the client actually approved remain
-- truthful and keep pointing at the snapshot that was confirmed.
--
-- "ContentStatusEvent" rows with toStatus = 'APPROVED' are NOT rewritten. They
-- are append-only audit history (AGENTS.md section 11) and the historical fact
-- remains true; the read layer supplies a legacy label instead.
--
-- "archivedAt" is NOT touched: a converted row is not archived, so the
-- FINAL_CONFIRMED -> ARCHIVED transition remains available to both actors.
--
-- Idempotent: on a re-run, or on a database that never held APPROVED rows, this
-- statement matches zero rows and is a no-op.
UPDATE "Content"
   SET "status" = 'FINAL_CONFIRMED'
 WHERE "status" = 'APPROVED';

-- 2. Add the database-level integrity guard for the new active terminal state.
--
-- This closes a real gap: FINAL_CONFIRMED has existed since
-- 20260917063349_phase1_ai_content_foundation with NO constraint, so any future
-- code path, migration, or manual statement could create a "confirmed" item with
-- no actual confirmation recorded. With this in place the Phase 2 terminal state
-- has parity with the V1 state it replaces.
--
-- Named distinctly from the V1 constraint, which is intentionally kept.
ALTER TABLE "Content"
  ADD CONSTRAINT "Content_final_confirmed_requires_final_confirmation"
  CHECK (
    "status" <> 'FINAL_CONFIRMED'
    OR (
      "finalConfirmedAt" IS NOT NULL
      AND "finalConfirmedByUserId" IS NOT NULL
      AND "finalConfirmedRevisionId" IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Explicitly NOT done, and why:
--
--   * DROP CONSTRAINT "Content_approved_requires_final_confirmation"
--     Retained by approved decision 1. It is now inert for application writes
--     but still guards any stray legacy APPROVED row.
--
--   * ALTER TYPE "ContentStatus" DROP VALUE 'APPROVED'
--     PostgreSQL cannot drop an enum value. Retained by approved decision 1.
--
--   * Any UPDATE against "ContentStatusEvent"
--     Append-only audit history (AGENTS.md section 11) is never rewritten.
-- ---------------------------------------------------------------------------
