-- Add platform administrator infrastructure:
--   - PlatformPermission enum type
--   - User.platformPermissions array column
--   - AdminAuditEvent audit table
--
-- Idempotency: CREATE TYPE IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so the
-- migration can be safely applied on a cluster that already has the objects.

-- ---------------------------------------------------------------------------
-- PlatformPermission enum
-- ---------------------------------------------------------------------------
CREATE TYPE "PlatformPermission" AS ENUM (
  'CLIENT_STATUS_MANAGEMENT',
  'AGENCY_DISCOVERY_APPROVAL',
  'GLOBAL_ORG_READ',
  'GLOBAL_USER_READ',
  'GLOBAL_CLIENT_READ',
  'GLOBAL_CONTENT_READ',
  'PLATFORM_ROLE_GRANT',
  'PLATFORM_ROLE_REVOKE',
  'PLATFORM_AUDIT_READ'
);

-- ---------------------------------------------------------------------------
-- User.platformPermissions array column
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "platformPermissions" "PlatformPermission"[] DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- AdminAuditEvent table (insert-only, cross-tenant audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdminAuditEvent" (
  "id"           UUID      NOT NULL DEFAULT gen_random_uuid(),
  "actorUserId"  UUID      NOT NULL,
  "action"       TEXT      NOT NULL,
  "targetType"   TEXT      NOT NULL,
  "targetId"     UUID,
  "details"      JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditEvent_actorUserId_createdAt_idx"
  ON "AdminAuditEvent"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_targetType_targetId_idx"
  ON "AdminAuditEvent"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_action_createdAt_idx"
  ON "AdminAuditEvent"("action", "createdAt");

-- FK constraint: PostgreSQL does not support IF NOT EXISTS on ALTER TABLE ADD
-- CONSTRAINT, so guard with a DO block that checks pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdminAuditEvent_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AdminAuditEvent"
      ADD CONSTRAINT "AdminAuditEvent_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;