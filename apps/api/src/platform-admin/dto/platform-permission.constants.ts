import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for @RequirePlatformPermission decorator.
 * Matches the key used by PlatformPermissionGuard.
 */
export const PLATFORM_PERMISSION_KEY = 'platformPermissions';

/**
 * Decorator to declare required platform permissions on a route or controller.
 *
 * Usage:
 *   @RequirePlatformPermission('GLOBAL_ORG_READ')
 *   @Get('organizations')
 *   async listOrgs() { ... }
 *
 *   @RequirePlatformPermission('GLOBAL_CLIENT_READ', 'GLOBAL_CONTENT_READ')
 *   @Get('clients/:id/content')
 *   async getClientContent() { ... }
 *
 * Multiple permissions are treated as ALL required (AND logic).
 */
export const RequirePlatformPermission = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator => SetMetadata(PLATFORM_PERMISSION_KEY, permissions);