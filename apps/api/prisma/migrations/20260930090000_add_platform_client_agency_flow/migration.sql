-- ClientAgencyFlow: add PLATFORM (Decision 012 - platform-owned Service
-- Provider). A first-time self-registered Client is attached to the single
-- SOCIALOPS Service-Provider Organization during activation, so
-- `initiatedBy` needs a truthful value: neither CLIENT (the user did not ask)
-- nor AGENCY (SocialOps is explicitly NOT an external Agency tenant).
--
-- Additive only: no rows are created or modified. Existing CLIENT/AGENCY rows
-- keep their meaning. PostgreSQL 12+ permits ADD VALUE in a transaction, and
-- the new value is not used by this migration.
ALTER TYPE "ClientAgencyFlow" ADD VALUE IF NOT EXISTS 'PLATFORM';
