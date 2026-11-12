-- Retain the approved FREELANCER AccountType value (Decision 024).
-- The preceding Phase 1A migration already adds the value; IF NOT EXISTS
-- also makes this safe for databases whose enum was created without it.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'FREELANCER';
