import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Client } from '@prisma/client';
import type { ClientAccessRequest } from '../guards/client-access.guard.js';

/**
 * Resolves the Client attached by `ClientAccessGuard` after it has
 * verified the direct User -> Client binding and the onboarding-ACTIVE
 * gate. Pure accessor - performs no authorization of its own and can only
 * be trusted on routes guarded by `ClientAccessGuard`.
 */
export const CurrentClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Client => {
    const request = ctx.switchToHttp().getRequest<ClientAccessRequest>();
    return request.client as Client;
  },
);