import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { MINIMUM_ROLE_KEY } from '../rbac.constants.js';
import { meetsMinimum, type RbacRole } from '../organization-roles.js';
import type { RequestOrganizationContext } from '../decorators/current-organization.decorator.js';

/**
 * Stage B7 minimum-role guard.
 *
 * NOT registered globally. Applied at the route (or controller) level
 * alongside `@RequireMinimumRole(...)`:
 *
 *   @UseGuards(RoleGuard)
 *   @RequireMinimumRole('ADMIN')
 *   ...
 *
 * Behavior:
 *
 *   - No `@RequireMinimumRole(...)` metadata: no-op, allow.
 *   - Missing `req.organization` (i.e. `OrganizationMembershipGuard` did
 *     not run or did not succeed): deny with `ForbiddenException`. The
 *     guard fails CLOSED - it never grants access without a verified
 *     organization context.
 *   - Role below required minimum: deny with `ForbiddenException`.
 *   - Role meets or exceeds the required minimum: allow.
 *
 * The role is read EXCLUSIVELY from the verified organization context
 * attached by `OrganizationMembershipGuard`. No role information is
 * accepted from the client.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RbacRole | undefined>(
      MINIMUM_ROLE_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );

    // No minimum-role metadata -> guard is a no-op. This keeps the
    // guard safe to apply broadly even on routes that do not need it.
    if (required === undefined || required === null) {
      return true;
    }

    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: JwtAccessPayload; organization?: RequestOrganizationContext }>();

    const organization = request.organization;
    if (!organization) {
      throw new ForbiddenException('Organization context required');
    }

    if (!meetsMinimum(organization.role, required)) {
      throw new ForbiddenException(
        `Minimum organization role required: ${required}`,
      );
    }

    return true;
  }
}
