/**
 * Stage B7 RBAC module constants.
 *
 * Centralized so the header name, reflector keys, and metadata shapes
 * are referenced from exactly one place. Renaming any of these requires
 * updating the corresponding transport convention (e.g. the HTTP header
 * name documented in the B7 plan) and must be done with explicit human
 * approval.
 */

/**
 * HTTP header carrying the requested organization (tenant) identifier.
 * B7 tenant identity is transported ONLY through this header.
 */
export const ORGANIZATION_HEADER = 'X-Organization-Id';

/**
 * Reflector key for @Public().
 *
 * @Public() means:
 *   - Organization context is NOT required.
 *   - JWT authentication is NOT affected.
 *
 * This key is consumed by OrganizationMembershipGuard.
 */
export const IS_PUBLIC_KEY = 'rbac.isPublic';

/**
 * Reflector key for @PublicAuth().
 *
 * @PublicAuth() means:
 *   - JWT authentication is NOT required.
 *   - Organization context is NOT affected.
 *
 * This key is consumed by JwtAuthGuard.
 */
export const IS_JWT_PUBLIC_KEY = 'isJwtPublic';

/**
 * Reflector key under which route handlers / controllers marked with
 * @RequireMinimumRole(...) store their minimum required organization
 * role. Read by RoleGuard.
 */
export const MINIMUM_ROLE_KEY = 'rbac.minimumRole';