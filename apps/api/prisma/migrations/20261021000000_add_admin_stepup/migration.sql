-- Add SuperAdmin step-up OTP challenge and session infrastructure:
--   - AdminStepUpChallenge: one active challenge per user (Argon2id hash)
--   - AdminStepUpSession: short-lived session token granting SUPERADMIN routes
--
-- Idempotency: CREATE TABLE IF NOT EXISTS so the migration can be safely
-- applied on a cluster that already has the objects.

-- ---------------------------------------------------------------------------
-- AdminStepUpChallenge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdminStepUpChallenge" (
  "id"             UUID      NOT NULL DEFAULT gen_random_uuid(),
  "userId"         UUID      NOT NULL,
  "channel"        TEXT      NOT NULL,
  "codeHash"       TEXT      NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "usedAt"         TIMESTAMP(3),
  "attempts"       INTEGER   NOT NULL DEFAULT 0,
  "resendCount"    INTEGER   NOT NULL DEFAULT 0,
  "lockedUntil"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "AdminStepUpChallenge_pkey" PRIMARY KEY ("id")
);

-- One active challenge per user: a new challenge replaces the previous one
-- (upsert semantics in AdminStepUpService). Enforces single-row-per-user
-- without a separate find-then-create race.
CREATE UNIQUE INDEX IF NOT EXISTS "AdminStepUpChallenge_userId_key"
  ON "AdminStepUpChallenge"("userId");

CREATE INDEX IF NOT EXISTS "AdminStepUpChallenge_expiresAt_idx"
  ON "AdminStepUpChallenge"("expiresAt");

-- ---------------------------------------------------------------------------
-- AdminStepUpSession
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdminStepUpSession" (
  "id"              UUID      NOT NULL DEFAULT gen_random_uuid(),
  "userId"          UUID      NOT NULL,
  "sessionTokenHash" TEXT     NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "revokedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "AdminStepUpSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminStepUpSession_sessionTokenHash_key"
  ON "AdminStepUpSession"("sessionTokenHash");

CREATE INDEX IF NOT EXISTS "AdminStepUpSession_userId_idx"
  ON "AdminStepUpSession"("userId");

CREATE INDEX IF NOT EXISTS "AdminStepUpSession_expiresAt_idx"
  ON "AdminStepUpSession"("expiresAt");

-- FK constraints (PostgreSQL does not support IF NOT EXISTS on ALTER TABLE
-- ADD CONSTRAINT, so guard with a DO block that checks pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminStepUpChallenge_userId_fkey'
  ) THEN
    ALTER TABLE "AdminStepUpChallenge"
      ADD CONSTRAINT "AdminStepUpChallenge_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminStepUpSession_userId_fkey'
  ) THEN
    ALTER TABLE "AdminStepUpSession"
      ADD CONSTRAINT "AdminStepUpSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;