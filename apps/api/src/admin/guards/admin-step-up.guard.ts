import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminStepUpService } from '../admin-step-up.service.js';

/**
 * SuperAdmin step-up session guard (Decision 020 §6).
 *
 * Validates the short-lived session token issued after successful step-up
 * OTP verification. The token is TTL-bound (15-minute expiry), NOT single-use:
 * it remains valid for multiple SUPERADMIN requests until it expires, is
 * explicitly revoked (via revokeAllSessions() on logout), or is consumed
 * by an explicit consumeSession() call (e.g. manual session lock).
 *
 * This design supports SPA dashboards that issue multiple parallel API
 * calls per page load — each call re-validates the token read-only.
 *
 * Header contract:
 *   - The session token is sent in the `X-Admin-Session-Token` header,
 *     NOT the `Authorization` header. This is deliberate: the global
 *     JwtAuthGuard runs BEFORE this guard and must receive a valid JWT
 *     in `Authorization` to identify the caller. Sending the session
 *     token as the bearer would make JwtAuthGuard reject the request
 *     before this guard ever runs.
 *   - After successful validation, this guard attaches the resolved
 *     User row to `req.user` so downstream guards (e.g.
 *     PlatformPermissionGuard) can read `req.user.sub` without needing
 *     the JWT payload.
 *
 * Behavior:
 *   - If no session token provided -> ForbiddenException
 *   - If token not found in DB -> ForbiddenException
 *   - If token already consumed -> ForbiddenException
 *   - If token revoked -> ForbiddenException
 *   - If token expired -> ForbiddenException
 *   - If token valid -> allow (does NOT consume the token)
 *
 * This guard delegates to AdminStepUpService.validateSession(), a
 * read-only check that verifies consumedAt, revokedAt, and expiresAt
 * in a single findUnique query. The token is invalidated by TTL expiry
 * or by revocation (logout), not by per-request consumption.
 */
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(private readonly adminStepUpService: AdminStepUpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract session token from X-Admin-Session-Token header.
    // The header value is a raw opaque token (NOT a JWT) that was issued
    // after successful step-up OTP verification.
    const sessionToken = request.headers['x-admin-session-token'];
    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new ForbiddenException('Missing or malformed session token header');
    }

    // Validate the token (read-only, TTL-bound). validateSession()
    // returns { userId } on success, or null if the token is unknown,
    // already consumed, revoked, or expired. The check is a single
    // findUnique query — the token is NOT consumed, so multiple parallel
    // SUPERADMIN requests within the 15-minute TTL all succeed.
    const result = await this.adminStepUpService.validateSession(sessionToken);
    if (!result) {
      throw new ForbiddenException('Step-up session invalid, consumed, or expired');
    }

    // Attach the resolved user to the request so downstream guards
    // (PlatformPermissionGuard) can read req.user.sub without needing
    // the JWT payload.
    (
      request as Request & {
        user: { sub: string; email?: string };
      }
    ).user = { sub: result.userId };

    return true;
  }
}