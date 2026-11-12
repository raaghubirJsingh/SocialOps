import { z } from 'zod';
import { OrganizationRole } from '@prisma/client';

/**
 * Request to change a user's role within an organization.
 *
 * Security: This endpoint is SOCIALOPS_ADMIN only and requires step-up
 * verification. Self-escalation is prohibited, and OWNER role cannot be
 * assigned or removed.
 */
export const updateOrganizationRoleSchema = z.object({
  /** Membership ID to update (not user ID - ensures tenant isolation) */
  membershipId: z.string().uuid(),
  /** New role to assign */
  role: z.nativeEnum(OrganizationRole),
});

export type UpdateOrganizationRoleDto = z.infer<typeof updateOrganizationRoleSchema>;

/**
 * Request to change a user's role within an organization (by user ID).
 *
 * Alternative to membershipId for cases where membership is not known.
 * The organizationId is required for tenant scoping validation.
 */
export const updateOrganizationRoleByMemberSchema = z.object({
  /** User ID whose role to change */
  userId: z.string().uuid(),
  /** Organization ID for tenant scoping */
  organizationId: z.string().uuid(),
  /** New role to assign */
  role: z.nativeEnum(OrganizationRole),
});

export type UpdateOrganizationRoleByMemberDto = z.infer<typeof updateOrganizationRoleByMemberSchema>;