import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PLATFORM_PERMISSION_KEY } from '../dto/platform-permission.constants.js';

/**
 * Platform Permission Guard.
 *
 * Enforces per-permission checks on User.platformPermissions array.
 * Used alongside @RequirePlatformPermission(...) decorator.
 *
 * This guard:
 * - Requires JwtAuthGuard to have already run (provides req.user)
 * - Requires AdminStepUpGuard to have already run (provides step-up session validation)
 * - Reads User.platformPermissions from database on every request (fail-closed)
 * - Grants access only if the user has ALL required permissions
 * - Does NOT require organization context (platform permissions are global)
 *
 * Usage:
 *   @UseGuards(PlatformPermissionGuard)
 *   @RequirePlatformPermission('GLOBAL_ORG_READ', 'GLOBAL_USER_READ')
 *   @Get('organizations')
 *   async listOrgs() { ... }
 */
@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      PLATFORM_PERMISSION_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );

    // No platform-permission metadata -> guard is a no-op
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: JwtAccessPayload }>();

    const user = request.user;
    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    // Fetch platform permissions from database (fail-closed)
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { platformPermissions: true, isSocialOpsAdmin: true },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    if (!dbUser.isSocialOpsAdmin) {
      throw new ForbiddenException('Platform admin authority required');
    }

    const userPermissions = dbUser.platformPermissions as string[];
    const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PLATFORM_PERMISSIONS',
        detail: `Required platform permissions: ${requiredPermissions.join(', ')}`,
        required: requiredPermissions,
        current: userPermissions,
      });
    }

    return true;
  }
}