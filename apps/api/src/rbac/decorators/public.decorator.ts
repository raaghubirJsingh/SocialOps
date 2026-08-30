import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../rbac.constants.js';

/**
 * Marks a route as public with respect to organization context.
 *
 * IMPORTANT:
 *
 * @Public() does NOT bypass JWT authentication.
 *
 * It only tells OrganizationMembershipGuard:
 *
 *   "Do not require X-Organization-Id for this route."
 *
 * Therefore:
 *
 *   @Public()
 *   logout()
 *
 * means:
 *
 *   JWT authentication       -> REQUIRED
 *   Organization context     -> NOT REQUIRED
 *
 * JWT authentication is controlled separately by @PublicAuth().
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);