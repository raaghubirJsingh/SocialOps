-- Add PLATFORM_SETTINGS_MANAGE permission (Decision 022).
-- PostgreSQL cannot drop enum values, so this is an additive append.

ALTER TYPE "PlatformPermission" ADD VALUE IF NOT EXISTS 'PLATFORM_SETTINGS_MANAGE';