import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ClientAccessRequest } from './client-access.guard.js';

/**
 * SOCIALOPS_ADMIN authority guard (Client Module V1, approved Option A).
 *
 * SOCIALOPS_ADMIN is a User-level GLOBAL authority, separate from the
 * organization-scoped OWNER/ADMIN/MEMBER/VIEWER roles. An Agency ADMIN
 * never implies this flag. The flag is read from the database on every
 * request (the JWT carries no admin claim, so no auth behavior changes)
 * - mirroring the existing convention that authorization state is read
 * server-side from the DB, never trusted from the token.
 *
 * The eventual Client V1 surface gated by this guard is limited to the
 * two approved platform operations:
 *   - Client status management
 *   - Agency discovery approval
 * There is intentionally no unrestricted administrative access.
 */
@Injectable()
export class SocialOpsAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientAccessRequest>();

    const user: JwtAccessPayload | undefined = request.user;
    if (!user || typeof user.sub !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { isSocialOpsAdmin: true },
    });

    // Fail closed: missing user or a false/absent flag denies - including
    // users who hold high organization-scoped roles (separation proof).
    if (!dbUser || dbUser.isSocialOpsAdmin !== true) {
      throw new ForbiddenException('SOCIALOPS_ADMIN authority required');
    }
    return true;
  }
}