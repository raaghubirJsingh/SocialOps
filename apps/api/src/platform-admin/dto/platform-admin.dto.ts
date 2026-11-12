import { z } from 'zod';
import { PlatformPermission } from '@prisma/client';

/** Grant platform admin to a user */
export const grantPlatformAdminSchema = z.object({
  /** User ID to grant platform admin to */
  userId: z.string().uuid(),
  /** Optional specific permissions (defaults to all) */
  permissions: z.array(z.nativeEnum(PlatformPermission)).optional(),
});

export type GrantPlatformAdminDto = z.infer<typeof grantPlatformAdminSchema>;

/** Revoke platform admin from a user */
export const revokePlatformAdminSchema = z.object({
  /** User ID to revoke platform admin from */
  userId: z.string().uuid(),
});

export type RevokePlatformAdminDto = z.infer<typeof revokePlatformAdminSchema>;

/** Bootstrap first platform admin (one-time) */
export const bootstrapPlatformAdminSchema = z.object({
  /** Bootstrap secret (must match BOOTSTRAP_ADMIN_SECRET) */
  bootstrapSecret: z.string().min(1),
  /** User ID is ignored; target is BOOTSTRAP_ADMIN_USER_ID from environment */
  userId: z.string().uuid().optional(),
});

export type BootstrapPlatformAdminDto = z.infer<
  typeof bootstrapPlatformAdminSchema
>;

/** Query params for paginated lists */
export const platformAdminListQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(25),
  cursor: z.string().uuid().optional(),
});

export type PlatformAdminListQueryDto = z.infer<
  typeof platformAdminListQuerySchema
>;

/** All platform permissions (for bootstrap default) */
export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = [
  'CLIENT_STATUS_MANAGEMENT',
  'AGENCY_DISCOVERY_APPROVAL',
  'GLOBAL_ORG_READ',
  'GLOBAL_USER_READ',
  'GLOBAL_CLIENT_READ',
  'GLOBAL_EMPLOYEE_READ',
  'GLOBAL_CONTENT_READ',
  'PLATFORM_ROLE_GRANT',
  'PLATFORM_ROLE_REVOKE',
  'PLATFORM_AUDIT_READ',
  'PLATFORM_SETTINGS_MANAGE',
];
