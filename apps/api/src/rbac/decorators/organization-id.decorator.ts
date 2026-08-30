import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ORGANIZATION_HEADER } from '../rbac.constants.js';

/**
 * Declaration / accessor for the `X-Organization-Id` header convention.
 *
 * This decorator does NOT verify the value - it is a read-only accessor
 * over the raw header for routes that need to surface or document the
 * convention. Real authorization (UUID validity, membership existence,
 * role enforcement) is the responsibility of `OrganizationMembershipGuard`
 * and `RoleGuard`.
 *
 * B7 tenant identity is transported ONLY through the
 * `X-Organization-Id` HTTP header. There is intentionally no
 * route-parameter, body, or query-string equivalent.
 */
export const OrganizationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // HTTP headers are case-insensitive on the wire, but Node/Express
    // normalizes them to lowercase on `request.headers`.
    const raw = request.headers[ORGANIZATION_HEADER.toLowerCase()];
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
    return undefined;
  },
);
