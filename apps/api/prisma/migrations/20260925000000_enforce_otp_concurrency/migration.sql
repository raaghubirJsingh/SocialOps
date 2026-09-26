-- OTP concurrency remediation: enforce exactly one active challenge row per
-- (pendingRegistrationId, channel) at the DATABASE level so concurrent
-- challenge generation deterministically upserts the same row.
--
-- Safe data handling: if concurrent duplicates were created before this guard,
-- keep exactly one row per group (most recently updated; highest id breaks ties)
-- and delete the rest BEFORE creating the unique index. On a clean table this
-- DELETE matches zero rows. The single resumeToken architecture (D1-A) is
-- untouched: no column is added to PendingRegistration.
DELETE FROM "RegistrationOtp" a
USING "RegistrationOtp" b
WHERE a."pendingRegistrationId" = b."pendingRegistrationId"
  AND a."channel" = b."channel"
  AND (a."updatedAt" < b."updatedAt"
    OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

-- Replace the non-unique lookup index with the composite unique guard.
DROP INDEX IF EXISTS "RegistrationOtp_pendingRegistrationId_channel_idx";
CREATE UNIQUE INDEX "RegistrationOtp_pendingRegistrationId_channel_key" ON "RegistrationOtp"("pendingRegistrationId", "channel");
