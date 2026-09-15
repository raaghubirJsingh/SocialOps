import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Request shape after JwtAuthGuard (user) and this guard (profile) run. */
export interface EmployeeContextRequest extends Request {
  user?: JwtAccessPayload;
  employeeProfile?: { id: string; userId: string };
}

/**
 * Employee Module V1 context guard.
 *
 * Runs AFTER the global JwtAuthGuard (same pattern as ClientAccessGuard):
 *   1. requires `req.user.sub` — fails closed with 401 if the JWT guard
 *      did not run (this guard never verifies JWTs itself);
 *   2. verifies a 1:1 EmployeeProfile row exists for that user in
 *      PostgreSQL. The DB check is authoritative on EVERY request — no
 *      isEmployee claim is ever accepted from the JWT (mirrors
 *      OrganizationMembershipGuard, which never trusts role claims);
 *   3. attaches the verified profile to `req.employeeProfile` for
 *      downstream controllers.
 *
 * A non-employee and an unknown user are indistinguishable: uniform 403,
 * no existence leak. Additive only — changes no existing auth/RBAC flow.
 */
@Injectable()
export class EmployeeContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<EmployeeContextRequest>();

    const user = request.user;
    if (!user || typeof user.sub !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true, userId: true },
    });
    if (!profile) {
      throw new ForbiddenException('Employee access denied');
    }

    request.employeeProfile = profile;
    return true;
  }
}
