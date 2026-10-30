-- Add GlobalSetting table for system-wide configuration
-- Decision 022: SuperAdmin-managed global settings (LLM provider, etc.)

CREATE TABLE "GlobalSetting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" UUID,

    CONSTRAINT "GlobalSetting_pkey" PRIMARY KEY ("id")
);

-- Unique index on key for fast lookups
CREATE UNIQUE INDEX "GlobalSetting_key_key" ON "GlobalSetting"("key");

-- Comment for documentation
COMMENT ON TABLE "GlobalSetting" IS 'System-wide configuration managed by SuperAdmin. Overrides env vars.';
COMMENT ON COLUMN "GlobalSetting"."key" IS 'Setting key (e.g., LLM_PROVIDER, LLM_MODEL).';
COMMENT ON COLUMN "GlobalSetting"."value" IS 'Setting value.';
COMMENT ON COLUMN "GlobalSetting"."description" IS 'Human-readable description for UI.';