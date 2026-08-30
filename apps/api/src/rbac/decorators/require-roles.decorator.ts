import { SetMetadata } from '@nestjs/common';
import { MINIMUM_ROLE_KEY } from '../rbac.constants.js';
import type { RbacRole } from '../organization-roles.js';

/**
 * Marks a route handler (or controller) as requiring a minimum
 * organization role. The role is compared using the inclusive minimum
 * semantics defined in `organization-roles.ts` (OWNER >= ADMIN >=
 * MEMBER >= VIEWER).
 *
 * This decorator only stores metadata; enforcement is performed by
 * `RoleGuard`, which must be applied to the route. Routes that omit
 * `RoleGuard` are not affected.
 */
export const RequireMinimumRole = (
  role: RbacRole,
): MethodDecorator & ClassDecorator => SetMetadata(MINIMUM_ROLE_KEY, role);
