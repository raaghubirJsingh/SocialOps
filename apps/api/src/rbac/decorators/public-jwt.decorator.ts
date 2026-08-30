import { SetMetadata } from '@nestjs/common';
import { IS_JWT_PUBLIC_KEY } from '../rbac.constants.js';

/**
 * Marks a route as public with respect to JWT authentication.
 *
 * This is intentionally separate from @Public().
 *
 * @Public() bypasses OrganizationMembershipGuard.
 * @PublicJwt() bypasses JwtAuthGuard.
 *
 * Keeping these concerns independent allows user-level authenticated
 * operations such as logout to require a valid JWT while not requiring
 * organization context.
 */
export const PublicJwt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_JWT_PUBLIC_KEY, true);