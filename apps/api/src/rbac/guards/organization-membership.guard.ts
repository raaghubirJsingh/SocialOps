import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { ORGANIZATION_HEADER, IS_PUBLIC_KEY } from '../rbac.constants.js';
import { OrganizationContextService } from '../organization-context.service.js';
import type { RequestOrganizationContext } from '../decorators/current-organization.decorator.js';

/**
 * Stage B7 organization membership guard.
 *
 * Registered as a GLOBAL guard (APP_GUARD). It runs AFTER `JwtAuthGuard`
 * (which is applied at the controller/route level on routes that need
 * authentication) and enforces organization tenant context for every
 * non-public route.
 *
 * Behavior:
 *
 *   1. If the route is marked `@Public()`, do nothing and return true.
 *      `@Public()` only bypasses THIS guard - it does not weaken
 *      `JwtAuthGuard`.
 *   2. Require `req.user` (a previously verified JWT payload). If
 *      missing, throw `UnauthorizedException` - the guard NEVER performs
 *      its own JWT verification, but a missing user means the JWT
 *      guard did not run (or did not produce a user) and we fail
 *      closed.
 *   3. Read `X-Organization-Id` from request headers. Missing or empty
 *      -> `BadRequestException`.
 *   4. Validate the header is a UUID. Malformed -> `BadRequestException`.
 *   5. Resolve the OrganizationMembership for (userId, organizationId).
 *      No match -> `ForbiddenException` with the standard B7 message.
 *   6. On success, attach `req.organization = { id, role }` for
 *      downstream guards and controllers.
 *
 * The role attached in step 6 is read exclusively from PostgreSQL; no
 * role information is ever accepted from the client, the JWT, the
 * body, the query string, or a custom header (AGENTS.md section 7).
 */
@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: OrganizationContextService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    // 1. Public route: skip the entire organization check. The
    //    @Public() decorator only bypasses THIS guard; it does not
    //    affect JwtAuthGuard, which is applied at the route level.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    if (isPublic) return true;

    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: JwtAccessPayload; organization?: RequestOrganizationContext }>();

    // 2. Authenticated user is required. We do NOT verify the JWT
    //    here; we only assert that JwtAuthGuard has already done so.
    const user = request.user;
    if (!user || typeof user.sub !== 'string' || user.sub.length === 0) {
      throw new UnauthorizedException('Authentication required');
    }

    // 3. Read the organization context header. HTTP headers are
    //    case-insensitive on the wire, but Node/Express normalizes
    //    them to lowercase on `request.headers`. We therefore
    //    always look up the lowercase form even though
    //    `ORGANIZATION_HEADER` keeps the canonical (mixed-case)
    //    spelling used in error messages and documentation.
    const rawHeader = request.headers[ORGANIZATION_HEADER.toLowerCase()];
    const headerValue = this.normalizeHeader(rawHeader);
    if (!headerValue) {
      throw new BadRequestException(
        `${ORGANIZATION_HEADER} header is required`,
      );
    }

    // 4. Validate UUID format. We do this BEFORE the database lookup
    //    so a malformed value is rejected cheaply and deterministically.
    if (!OrganizationMembershipGuard.UUID_REGEX.test(headerValue)) {
      throw new BadRequestException(
        `${ORGANIZATION_HEADER} header must be a valid UUID`,
      );
    }

    // 5. Resolve the verified (userId, organizationId) membership.
    //    The service throws ForbiddenException with the standard
    //    B7 message when no membership exists.
    const organization = await this.context.resolve(user.sub, headerValue);

    // 6. Attach the verified context for downstream guards and
    //    controllers. Only these two fields are exposed - never the
    //    membership row itself, never other users' memberships.
    request.organization = organization;
    return true;
  }

  private normalizeHeader(
    raw: string | string[] | undefined,
  ): string | undefined {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(raw) && typeof raw[0] === 'string') {
      const trimmed = raw[0].trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  // RFC 4122 UUID (any version, case-insensitive). Same shape Prisma
  // stores for @id @default(uuid()) @db.Uuid columns.
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}
