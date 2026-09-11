-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientOnboardingStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "AgencyRelationshipStatus" AS ENUM ('PENDING_REQUEST', 'PENDING_INVITATION', 'ACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "FieldChangeRequestStatus" AS ENUM ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClientField" AS ENUM ('NAME', 'DIRECT_EMAIL', 'DIRECT_MOBILE', 'PRIMARY_CONTACT_NAME', 'PRIMARY_CONTACT_MOBILE', 'WEBSITE', 'ADDRESS', 'DESCRIPTION', 'INDUSTRY', 'CLIENT_TYPE', 'LOGO_AVATAR', 'NOTES');

-- CreateEnum
CREATE TYPE "ClientAgencyFlow" AS ENUM ('CLIENT', 'AGENCY');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "discoveryApprovedAt" TIMESTAMP(3),
ADD COLUMN     "discoveryApprovedByUserId" UUID,
ADD COLUMN     "discoveryOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSocialOpsAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "socialOpsAdminGrantedAt" TIMESTAMP(3),
ADD COLUMN     "socialOpsAdminGrantedById" UUID,
ADD COLUMN     "socialOpsAdminRevokedAt" TIMESTAMP(3),
ALTER COLUMN "isActive" SET DEFAULT false;

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "type" "ClientType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "directEmail" TEXT NOT NULL,
    "directPhone" TEXT NOT NULL,
    "primaryContactName" TEXT,
    "primaryContactPhone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "industry" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "onboardingStatus" "ClientOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "onboardingCompletedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAgencyRelationship" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "AgencyRelationshipStatus" NOT NULL,
    "initiatedBy" "ClientAgencyFlow" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgencyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientInvitation" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFieldChange" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "field" "ClientField" NOT NULL,
    "newValue" TEXT,
    "status" "FieldChangeRequestStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "requestedByUserId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,

    CONSTRAINT "ClientFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEvent" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_ownerUserId_idx" ON "Client"("ownerUserId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_onboardingStatus_idx" ON "Client"("onboardingStatus");

-- CreateIndex
CREATE INDEX "ClientAgencyRelationship_clientId_status_idx" ON "ClientAgencyRelationship"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientAgencyRelationship_organizationId_status_idx" ON "ClientAgencyRelationship"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvitation_tokenHash_key" ON "ClientInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientInvitation_clientId_idx" ON "ClientInvitation"("clientId");

-- CreateIndex
CREATE INDEX "ClientInvitation_email_idx" ON "ClientInvitation"("email");

-- CreateIndex
CREATE INDEX "ClientFieldChange_clientId_field_idx" ON "ClientFieldChange"("clientId", "field");

-- CreateIndex
CREATE INDEX "ClientFieldChange_clientId_status_idx" ON "ClientFieldChange"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientEvent_clientId_createdAt_idx" ON "ClientEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Organization_discoveryOptIn_idx" ON "Organization"("discoveryOptIn");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgencyRelationship" ADD CONSTRAINT "ClientAgencyRelationship_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgencyRelationship" ADD CONSTRAINT "ClientAgencyRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInvitation" ADD CONSTRAINT "ClientInvitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFieldChange" ADD CONSTRAINT "ClientFieldChange_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEvent" ADD CONSTRAINT "ClientEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
