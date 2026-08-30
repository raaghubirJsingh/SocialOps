import type { OrganizationRole } from '@prisma/client';

/**
 * Stage B7 RBAC role model.
 *
 * Single authoritative implementation of the four locked roles
 * (AGENTS.md section 7). No other role may be added without explicit
 * human approval.
 *
 * Roles are RANKED using inclusive minimum-role semantics:
 *
 *   OWNER (3)  >=  ADMIN (2)  >=  MEMBER (1)  >=  VIEWER (0)
 *
 * So a user with role OWNER satisfies every minimum-role check,
 * MEMBER satisfies MEMBER and VIEWER, and so on.
 *
 * Roles are NOT assigned in this file - they are loaded from the
 * authenticated user's OrganizationMembership row (AGENTS.md section 6
 * and 7). This module only defines the rank order and the comparator.
 */

export type RbacRole = OrganizationRole;

export const ROLE_RANK: Readonly<Record<RbacRole, number>> = Object.freeze({
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
});

/**
 * Inclusive minimum-role comparison. Returns true iff the user's role
 * meets or exceeds the required role.
 *
 * Unknown / undefined / null values MUST fail closed - i.e. the function
 * returns false - so a missing or malformed role can never grant access
 * (AGENTS.md section 7: deny by default, least privilege).
 */
export function meetsMinimum(
  userRole: unknown,
  requiredRole: RbacRole,
): boolean {
  if (typeof userRole !== 'string') return false;
  // ROLE_RANK lookup is type-safe only for known RbacRole values; we
  // intentionally look the value up at runtime so any unrecognized string
  // (e.g. a future enum member that bypassed TypeScript) fails closed.
  const userRank = (ROLE_RANK as Record<string, number | undefined>)[userRole];
  if (typeof userRank !== 'number') return false;
  const requiredRank = ROLE_RANK[requiredRole];
  return userRank >= requiredRank;
}
