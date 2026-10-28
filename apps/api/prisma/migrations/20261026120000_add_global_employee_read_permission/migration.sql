-- Add GLOBAL_EMPLOYEE_READ platform permission enum value.
--
-- This adds the GLOBAL_EMPLOYEE_READ value to the PlatformPermission enum so
-- that the GET /admin/employees global-read endpoint can be protected with
-- @RequirePlatformPermission('GLOBAL_EMPLOYEE_READ').
--
-- Additive change: only appends a new enum value, no existing values are
-- modified or removed. Safe to apply on top of the current database state.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PlatformPermission'
      AND e.enumlabel = 'GLOBAL_EMPLOYEE_READ'
  ) THEN
    ALTER TYPE "PlatformPermission" ADD VALUE 'GLOBAL_EMPLOYEE_READ';
  END IF;
END $$;