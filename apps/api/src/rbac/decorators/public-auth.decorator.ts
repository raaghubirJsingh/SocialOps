import { SetMetadata } from '@nestjs/common';
import { IS_JWT_PUBLIC_KEY } from '../rbac.constants.js';

/**
 * Marks a route as public with respect to JWT authentication.
 *
 * @PublicAuth() tells JwtAuthGuard that the route does not require
 * an Authorization: Bearer <token> header.
 *
 * IMPORTANT:
 *
 * @PublicAuth() does NOT bypass organization membership validation.
 *
 * For an endpoint that requires neither JWT authentication nor
 * organization context, use both:
 *
 *   @Public()
 *   @PublicAuth()
 *
 * Example:
 *
 *   register:
 *     JWT           -> NOT required
 *     Organization  -> NOT required
 *
 *   login:
 *     JWT           -> NOT required
 *     Organization  -> NOT required
 *
 *   refresh:
 *     JWT           -> NOT required
 *     Organization  -> NOT required
 *
 * Logout intentionally does NOT use @PublicAuth():
 *
 *   @Public()
 *   logout()
 *
 * Therefore:
 *
 *   JWT           -> REQUIRED
 *   Organization  -> NOT required
 */
export const PublicAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_JWT_PUBLIC_KEY, true);