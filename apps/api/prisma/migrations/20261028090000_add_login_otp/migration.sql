-- Add mandatory login OTP challenge infrastructure:
--   - LoginOtpChannel: EMAIL only for V1
--   - LoginOtpChallenge: one active challenge per user (Argon2id hash)
--
-- Every sign-in path (SERVICE_PROVIDER, CLIENT, and Employee) now requires
-- a valid email OTP in addition to the password. The challenge model mirrors
-- AdminStepUpChallenge: one active challenge per user at a time, 5-minute
-- expiry, single use, 3 wrong attempts -> 1-hour lock, resend quota of 3.
-- The 60-second resend cooldown is enforced server-side via lastSentAt.
--
-- Idempotency: CREATE TABLE IF NOT EXISTS so the migration can be safely
-- applied on a cluster that already has the objects.

-- ---------------------------------------------------------------------------
-- LoginOtpChannel enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'LoginOtpChannel'
  ) THEN
    CREATE TYPE "LoginOtpChannel" AS ENUM ('EMAIL');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- LoginOtpChallenge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LoginOtpChallenge" (
  "id"            UUID      NOT NULL DEFAULT gen_random_uuid(),
  "userId"        UUID      NOT NULL,
  "channel"       "LoginOtpChannel" NOT NULL,
  "codeHash"      TEXT      NOT NULL,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "usedAt"        TIMESTAMP(3),
  "attempts"      INTEGER   NOT NULL DEFAULT 0,
  "resendCount"   INTEGER   NOT NULL DEFAULT 0,
  "lockedUntil"   TIMESTAMP(3),
  "lastSentAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "LoginOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- One active challenge per user: a new challenge replaces the previous one
-- (upsert semantics in LoginOtpService). Enforces single-row-per-user
-- without a separate find-then-create race.
CREATE UNIQUE INDEX IF NOT EXISTS "LoginOtpChallenge_userId_key"
  ON "LoginOtpChallenge"("userId");

CREATE INDEX IF NOT EXISTS "LoginOtpChallenge_expiresAt_idx"
  ON "LoginOtpChallenge"("expiresAt");

-- FK constraint (PostgreSQL does not support IF NOT EXISTS on ALTER TABLE
-- ADD CONSTRAINT, so guard with a DO block that checks pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoginOtpChallenge_userId_fkey'
  ) THEN
    ALTER TABLE "LoginOtpChallenge"
      ADD CONSTRAINT "LoginOtpChallenge_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;