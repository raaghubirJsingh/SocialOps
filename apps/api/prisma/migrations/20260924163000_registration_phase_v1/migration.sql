-- Registration Phase v1.0 (human-approved; GATE A / Decision 014).
--
-- 1. AccountType value rename INDIVIDUAL_BUSINESS -> CLIENT: DATA-PRESERVING
--    rename in place. Every existing row keeps its meaning (same persona,
--    same provisioning no-op). Individual vs Business remains a ClientType,
--    never an AccountType.
-- 2. User.phoneVerifiedAt (L9): permanent phone-verification evidence set at
--    registration completion; NULL for all pre-existing rows (never verified).
-- 3. PendingRegistration: dedicated pre-User registration lifecycle. No User
--    row exists until completion. Lifetime exactly 72h; createdAt/expiresAt
--    never reset (L6/OPEN-7); single resumeTokenHash credential only (D1-A -
--    rotated in place at reminder events; no second credential exists).
-- 4. RegistrationOtp + RegistrationOtpChannel: hashed 6-digit OTP challenges
--    (Argon2id hash only; 5-minute expiry; attempt/resend accounting).
-- Both new tables start empty; no backfill is required or performed.

-- AlterEnum (data-preserving in-place value rename)
ALTER TYPE "AccountType" RENAME VALUE 'INDIVIDUAL_BUSINESS' TO 'CLIENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "RegistrationOtpChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "accountType" "AccountType",
    "discoveryAnswers" JSONB,
    "emailVerifiedAt" TIMESTAMP(3),
    "whatsappVerifiedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "resumeTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reminderState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationOtp" (
    "id" UUID NOT NULL,
    "pendingRegistrationId" UUID NOT NULL,
    "channel" "RegistrationOtpChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_email_key" ON "PendingRegistration"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_resumeTokenHash_key" ON "PendingRegistration"("resumeTokenHash");

-- CreateIndex
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");

-- CreateIndex
CREATE INDEX "RegistrationOtp_pendingRegistrationId_channel_idx" ON "RegistrationOtp"("pendingRegistrationId", "channel");

-- AddForeignKey
ALTER TABLE "RegistrationOtp" ADD CONSTRAINT "RegistrationOtp_pendingRegistrationId_fkey" FOREIGN KEY ("pendingRegistrationId") REFERENCES "PendingRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
