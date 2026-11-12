/*
  Warnings:

  - Removed the `consumedAt` column from `AdminStepUpSession`. The column was
    always NULL in practice (the `consumeSession()` method that set it was
    never called by any runtime path). Sessions are TTL-bound (15-minute
    expiry) per Decision 3, Option A — they remain valid for multiple
    SUPERADMIN requests until expiry or explicit revocation.

*/

-- AlterTable
ALTER TABLE "AdminStepUpSession" DROP COLUMN "consumedAt";