-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RawDataSource" AS ENUM ('CLIENT_UPLOAD', 'CLIENT_FORM', 'AGENCY_UPLOAD', 'EXTERNAL_IMPORT');

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "platformAccountId" TEXT,
    "handle" TEXT,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "finalConfirmedAt" TIMESTAMP(3),
    "finalConfirmedByUserId" UUID,
    "finalConfirmedRevisionId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentStatusEvent" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "fromStatus" "ContentStatus",
    "toStatus" "ContentStatus" NOT NULL,
    "actorUserId" UUID,
    "actorRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawData" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "source" "RawDataSource" NOT NULL,
    "contentId" UUID,
    "mimeType" TEXT,
    "originalFileName" TEXT,
    "extractedText" TEXT,
    "metadata" JSONB,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER,
    "storageRef" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAccount_clientId_platform_idx" ON "SocialAccount"("clientId", "platform");

-- CreateIndex
CREATE INDEX "SocialAccount_clientId_isActive_idx" ON "SocialAccount"("clientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_clientId_platform_platformAccountId_key" ON "SocialAccount"("clientId", "platform", "platformAccountId");

-- CreateIndex
CREATE INDEX "Content_clientId_status_idx" ON "Content"("clientId", "status");

-- CreateIndex
CREATE INDEX "Content_clientId_createdAt_idx" ON "Content"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Content_finalConfirmedByUserId_idx" ON "Content"("finalConfirmedByUserId");

-- CreateIndex
CREATE INDEX "ContentRevision_clientId_contentId_idx" ON "ContentRevision"("clientId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRevision_contentId_revision_key" ON "ContentRevision"("contentId", "revision");

-- CreateIndex
CREATE INDEX "ContentStatusEvent_clientId_createdAt_idx" ON "ContentStatusEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentStatusEvent_contentId_createdAt_idx" ON "ContentStatusEvent"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "RawData_clientId_capturedAt_idx" ON "RawData"("clientId", "capturedAt");

-- CreateIndex
CREATE INDEX "RawData_clientId_source_idx" ON "RawData"("clientId", "source");

-- CreateIndex
CREATE INDEX "RawData_contentId_idx" ON "RawData"("contentId");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_finalConfirmedByUserId_fkey" FOREIGN KEY ("finalConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawData" ADD CONSTRAINT "RawData_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawData" ADD CONSTRAINT "RawData_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawData" ADD CONSTRAINT "RawData_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraint (not representable in the Prisma schema).
--
-- Final Confirmation gate (Client Operations V1): an APPROVED Content row MUST
-- carry the complete Final Confirmation triple. This is the database-level
-- half of the rule approved in docs/APPROVED_DECISIONS.md Decision 008: no
-- future code path, migration, or manual statement can create an approved item
-- without a recorded confirmation, so publishing can never follow an approval
-- that did not actually happen.
--
-- Precedent for hand-written SQL in a Prisma migration:
-- 20260916000000_enforce_one_active_agency.
-- ---------------------------------------------------------------------------
ALTER TABLE "Content"
  ADD CONSTRAINT "Content_approved_requires_final_confirmation"
  CHECK (
    "status" <> 'APPROVED'
    OR (
      "finalConfirmedAt" IS NOT NULL
      AND "finalConfirmedByUserId" IS NOT NULL
      AND "finalConfirmedRevisionId" IS NOT NULL
    )
  );

