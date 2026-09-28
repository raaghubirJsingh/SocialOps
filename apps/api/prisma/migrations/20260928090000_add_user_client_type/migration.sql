-- Client 1-Click Activation: User.clientType + PendingRegistration.clientType
-- (human-approved; supports the 1-Click activation refactor).
--
-- Why: the self-registered Client activation used to re-ask the persona
-- (Individual vs Business) and re-collect the name/phone on the frontend,
-- duplicating data already verified at Registration Phase v1.0 completion.
-- AGENTS.md §17.1 is explicit that "Individual vs Business is a ClientType,
-- never an AccountType", so User.accountType (SERVICE_PROVIDER | CLIENT)
-- canNOT be reused for this. The persona is therefore captured ONCE, at
-- registration, and read by the activation flow.
--
-- Safety: BOTH columns are NULLABLE and additive, so every pre-existing row
-- stays valid with no backfill and no data loss. A NULL clientType simply
-- means the persona was never collected; those users keep the existing
-- (mobile-OTP) activation path, so this migration changes no behavior on its
-- own. The "ClientType" enum already exists (20260910052335_client_module_v1).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "clientType" "ClientType";

-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN "clientType" "ClientType";
