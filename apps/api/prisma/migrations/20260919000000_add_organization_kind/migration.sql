-- Organization classification (Decision 012) - additive only.
-- AGENCY is the default: every pre-existing and self-registered provider
-- tenant is an external Agency. No data rows are created or modified by
-- this migration; the platform-owned SOCIALOPS Organization is provisioned
-- separately (approved data operation, NOT part of this migration).

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('SOCIALOPS', 'AGENCY');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "kind" "OrganizationKind" NOT NULL DEFAULT 'AGENCY';

-- Enforce AT MOST ONE platform-owned (SOCIALOPS) Organization (Decision 012).
-- Prisma cannot express partial indexes; raw SQL per repository convention
-- (mirrors the one-ACTIVE-Agency enforcement in
-- 20260916000000_enforce_one_active_agency).
CREATE UNIQUE INDEX "Organization_one_socialops_idx"
ON "Organization" ("kind")
WHERE "kind" = 'SOCIALOPS';
