-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('SCENARIO_1', 'SCENARIO_2', 'SCENARIO_3');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentStatus" ADD VALUE 'AWAITING_MANAGER_APPROVAL';
ALTER TYPE "ContentStatus" ADD VALUE 'UNDER_CLIENT_REVIEW';
ALTER TYPE "ContentStatus" ADD VALUE 'FINAL_CONFIRMED';

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "agencyId" UUID,
ADD COLUMN     "scenarioType" "ScenarioType";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "skillSpecialization" TEXT;

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "requestDetails" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalNote_contentId_idx" ON "InternalNote"("contentId");

-- CreateIndex
CREATE INDEX "InternalNote_agencyId_contentId_idx" ON "InternalNote"("agencyId", "contentId");

-- CreateIndex
CREATE INDEX "InternalNote_authorId_idx" ON "InternalNote"("authorId");

-- CreateIndex
CREATE INDEX "ChangeRequest_contentId_idx" ON "ChangeRequest"("contentId");

-- CreateIndex
CREATE INDEX "ChangeRequest_requestedById_contentId_idx" ON "ChangeRequest"("requestedById", "contentId");

-- CreateIndex
CREATE INDEX "Content_agencyId_idx" ON "Content"("agencyId");

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
