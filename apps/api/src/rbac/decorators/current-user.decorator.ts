import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';

/**
 * Resolves the authenticated user payload (`{ sub, email }`) that
 * `JwtAuthGuard` attaches to the request.
 *
 * This is a pure accessor over `req.user`. It performs no
 * authentication or authorization of its own - it can only be trusted
 * on routes protected by `JwtAuthGuard`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtAccessPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtAccessPayload }>();
    return request.user;
  },
);
