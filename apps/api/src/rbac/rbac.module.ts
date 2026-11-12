import { Global, Module } from '@nestjs/common';
import { OrganizationContextService } from './organization-context.service.js';
import { OrganizationRoleService } from './organization-role.service.js';
import { OrganizationMembershipGuard } from './guards/organization-membership.guard.js';
import { RoleGuard } from './guards/role.guard.js';

/**
 * Stage B7 RBAC module.
 *
 * Provides the organization-membership guard (registered globally) and
 * the minimum-role guard (applied at the route level). Both rely on
 * `OrganizationContextService`, which performs the single authoritative
 * (userId, organizationId) -> role lookup against PostgreSQL.
 *
 * Marked `@Global()` so any future module that needs `RoleGuard` or
 * `OrganizationContextService` can simply inject them without
 * re-importing this module.
 */
@Global()
@Module({
  providers: [
    OrganizationContextService,
    OrganizationRoleService,
    OrganizationMembershipGuard,
    RoleGuard,
  ],
  exports: [
    OrganizationContextService,
    OrganizationRoleService,
    OrganizationMembershipGuard,
    RoleGuard,
  ],
})
export class RbacModule {}
