-- CreateTable
CREATE TABLE "SocialAccountCredential" (
    "id" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "tokenKeyVersion" INTEGER NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccountCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccountCredential_socialAccountId_key" ON "SocialAccountCredential"("socialAccountId");

-- CreateIndex
CREATE INDEX "SocialAccountCredential_tokenKeyVersion_idx" ON "SocialAccountCredential"("tokenKeyVersion");

-- CreateIndex
CREATE INDEX "SocialAccountCredential_expiresAt_idx" ON "SocialAccountCredential"("expiresAt");

-- AddForeignKey
ALTER TABLE "SocialAccountCredential" ADD CONSTRAINT "SocialAccountCredential_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
