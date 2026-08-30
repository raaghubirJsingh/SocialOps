import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { OrganizationRole } from '@prisma/client';

/**
 * The organization context attached by `OrganizationMembershipGuard` to
 * the request on successful membership verification.
 */
export interface RequestOrganizationContext {
  id: string;
  role: OrganizationRole;
}

/**
 * Resolves the verified organization context (`{ id, role }`) that
 * `OrganizationMembershipGuard` attaches to the request.
 *
 * This decorator is a pure accessor over `req.organization`. It performs
 * no authorization of its own - it can only be trusted on routes
 * protected by `OrganizationMembershipGuard` (which is global) and
 * `JwtAuthGuard`.
 */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestOrganizationContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { organization: RequestOrganizationContext }>();
    return request.organization;
  },
);
