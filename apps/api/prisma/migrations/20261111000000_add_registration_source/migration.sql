-- Add registration_source discriminator to PendingRegistration.
-- Conversational rows (POST /auth/registration/start) MUST carry an accepted
-- discovery snapshot at completion; simple rows (POST /auth/registration/client
-- or /agency) carry none and the discovery gate is skipped entirely for them.

CREATE TYPE "RegistrationSource" AS ENUM (
  'CONVERSATIONAL',
  'SIMPLE_CLIENT',
  'SIMPLE_AGENCY'
);

ALTER TABLE "PendingRegistration"
  ADD COLUMN "registrationSource" "RegistrationSource";