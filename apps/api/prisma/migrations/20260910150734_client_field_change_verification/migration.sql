-- AlterTable
ALTER TABLE "ClientFieldChange" ADD COLUMN     "verificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationTokenHash" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ClientFieldChange_verificationTokenHash_key" ON "ClientFieldChange"("verificationTokenHash");
