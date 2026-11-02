/*
  Warnings:

  - Changed the type of `channel` on the `AdminStepUpChallenge` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AdminStepUpChannel" AS ENUM ('EMAIL');

-- DropForeignKey
ALTER TABLE "AdminAuditEvent" DROP CONSTRAINT "AdminAuditEvent_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "FreelancerProfile" DROP CONSTRAINT "FreelancerProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "LoginOtpChallenge" DROP CONSTRAINT "LoginOtpChallenge_userId_fkey";

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_verifiedByUserId_fkey";

-- DropIndex
DROP INDEX "Organization_verificationStatus_idx";

-- DropIndex
DROP INDEX "Organization_verifiedByUserId_idx";

-- AlterTable
ALTER TABLE "AdminAuditEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AdminStepUpChallenge" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "channel",
ADD COLUMN     "channel" "AdminStepUpChannel" NOT NULL;

-- AlterTable
ALTER TABLE "AdminStepUpSession" ADD COLUMN     "consumedAt" TIMESTAMP(3),
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FreelancerProfile" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GlobalSetting" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LoginOtpChallenge" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "GlobalSetting_key_idx" ON "GlobalSetting"("key");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerProfile" ADD CONSTRAINT "FreelancerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginOtpChallenge" ADD CONSTRAINT "LoginOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
