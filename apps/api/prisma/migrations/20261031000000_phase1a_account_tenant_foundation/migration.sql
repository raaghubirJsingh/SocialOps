-- Phase 1A: Account and Tenant Foundation (schema only)

-- Enum: AccountType
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'FREELANCER';

-- Enum: OrganizationKind
ALTER TYPE "OrganizationKind" ADD VALUE IF NOT EXISTS 'NEWS_ORGANIZATION';

-- Enum: OrganizationVerificationStatus
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationVerificationStatus') THEN
    CREATE TYPE "OrganizationVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
  END IF;
END
$$;

-- Organization verification columns
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "verificationStatus" "OrganizationVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verifiedByUserId" UUID;

-- Backfill existing organizations as VERIFIED
UPDATE "Organization" SET "verificationStatus" = 'VERIFIED' WHERE "verificationStatus" = 'PENDING';

-- FK for verifiedBy
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_verifiedByUserId_fkey"
  FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

-- FreelancerProfile table
CREATE TABLE IF NOT EXISTS "FreelancerProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "basicInfoCompleted" BOOLEAN NOT NULL DEFAULT false,
  "introCompleted" BOOLEAN NOT NULL DEFAULT false,
  "skillsCompleted" BOOLEAN NOT NULL DEFAULT false,
  "experienceCompleted" BOOLEAN NOT NULL DEFAULT false,
  "educationCompleted" BOOLEAN NOT NULL DEFAULT false,
  "reviewConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "profileCompletedAt" TIMESTAMP(3),
  "basicInfo" JSONB,
  "professionalIntro" TEXT,
  "skills" JSONB,
  "workExperience" JSONB,
  "education" JSONB,
  "noWorkExperience" BOOLEAN NOT NULL DEFAULT false,
  "noFormalEducation" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreelancerProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FreelancerProfile_userId_key" UNIQUE ("userId"),
  CONSTRAINT "FreelancerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "FreelancerProfile_profileCompletedAt_idx" ON "FreelancerProfile"("profileCompletedAt");
CREATE INDEX IF NOT EXISTS "Organization_verificationStatus_idx" ON "Organization"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Organization_verifiedByUserId_idx" ON "Organization"("verifiedByUserId");
