import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * SuperAdmin step-up session guard (Decision 020 §6).
 *
 * Validates the short-lived session token issued after successful step-up
 * OTP verification. The token is single-use: consumed on first SUPERADMIN
 * request and revoked afterwards, so a leaked session token cannot be
 * replayed.
 *
 * This guard REPLACE the existing SocialOpsAdminGuard on SUPERADMIN routes
 * that require step-up verification. It reads the session token hash from
 * the database on every request (fail-closed) and verifies it against the
 * presented token.
 *
 * Behavior:
 *   - If no session token provided -> ForbiddenException
 *   - If token not found in DB (unknown/expired) -> ForbiddenException
 *   - If token already consumed -> ForbiddenException
 *   - If token revoked -> ForbiddenException
 *   - If token expired -> ForbiddenException
 *   - If token valid and unconsumed -> mark as consumed and allow
 */
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract session token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ForbiddenException('Missing or malformed Authorization header');
    }

    const sessionToken = authHeader.slice(7); // Remove 'Bearer ' prefix
    if (!sessionToken) {
      throw new ForbiddenException('Missing session token');
    }

    // Hash the token for comparison (only hash is stored)
    const sessionTokenHash = require('node:crypto')
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    // Find the session record
    const session = await this.prisma.adminStepUpSession.findUnique({
      where: { sessionTokenHash: sessionTokenHash },
    });

    // Fail closed: missing session or already consumed/revoked/expired
    if (!session) {
      throw new ForbiddenException('Step-up session invalid or expired');
    }

    if (session.consumedAt !== null) {
      throw new ForbiddenException('Step-up session already consumed');
    }

    if (session.revokedAt !== null) {
      throw new ForbiddenException('Step-up session has been revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException('Step-up session has expired');
    }

    // Valid session: mark as consumed (single-use)
    await this.prisma.adminStepUpSession.updateMany({
      where: { id: session.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return true;
  }
}