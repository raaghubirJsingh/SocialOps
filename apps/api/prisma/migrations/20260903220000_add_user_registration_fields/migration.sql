-- Stage B7+ Registration Page Redesign: add the public account-type
-- selection, full name, and optional phone to the User record.
--
-- This migration is purely additive. It does NOT touch the Client
-- Foundation (Client, ClientEmployee, ClientType, ClientStatus), the
-- Organization / Workspace / OrganizationMembership model, the
-- RefreshToken table, the EmailVerificationToken table, or any
-- existing rows. New users created from this point on get
-- `isActive = false` by default; existing rows keep their current
-- `isActive` value (the @default change in schema.prisma only applies
-- to future inserts, not to a backfill of existing rows).
--
-- See AGENTS.md §17 for the Product Entity Hierarchy and the
-- registration data model contract.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM (
    'SERVICE_PROVIDER',
    'INDIVIDUAL_BUSINESS'
);

-- AlterTable: add nullable fields for fullName, phone, accountType.
-- All three are NULLABLE so that any pre-existing User rows remain
-- valid without a backfill.
ALTER TABLE "User"
    ADD COLUMN "fullName" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "accountType" "AccountType";

-- NOTE: The Prisma schema's `isActive @default(false)` change applies
-- only to future INSERTs. We deliberately do NOT issue an UPDATE
-- against existing rows. Their current isActive value is preserved.
