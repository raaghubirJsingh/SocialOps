-- CreateTable
CREATE TABLE "MobileVerificationToken" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "requestedByUserId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileVerificationToken_tokenHash_key" ON "MobileVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileVerificationToken_clientId_idx" ON "MobileVerificationToken"("clientId");

-- AddForeignKey
ALTER TABLE "MobileVerificationToken" ADD CONSTRAINT "MobileVerificationToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileVerificationToken" ADD CONSTRAINT "MobileVerificationToken_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
