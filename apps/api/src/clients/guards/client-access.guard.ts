import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Client } from '@prisma/client';
import type { Request } from 'express';

import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Request shape after JwtAuthGuard (user) and this guard (client) run. */
export interface ClientAccessRequest extends Request {
  user?: JwtAccessPayload;
  client?: Client;
}

/**
 * Normal client-side operational access guard (Client Module V1).
 *
 * Locked rule: normal Client operational/self-service access requires
 *   1. an authenticated User whose id matches Client.ownerUserId (the
 *      direct User -> Client binding), AND
 *   2. ClientOnboardingStatus = ACTIVE.
 *
 * A PENDING Client is NOT operationally usable even when ClientStatus is
 * ACTIVE. The controlled pre-activation onboarding/acceptance routes are
 * the ONLY PENDING-time exception and must NOT use this guard.
 *
 * ClientStatus operational restrictions (ACTIVE/INACTIVE/SUSPENDED) are
 * enforced subsequently in the service layer of the later ACT phases -
 * this guard owns only the locked binding + onboarding gate.
 *
 * Additive only: this guard changes no existing auth/RBAC behavior. The
 * global JwtAuthGuard has already authenticated the request when this
 * runs; there is intentionally no ClientMember/RBAC model.
 */
@Injectable()
export class ClientAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientAccessRequest>();

    const user = request.user;
    if (!user || typeof user.sub !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const headerValue = request.headers?.['x-client-id'];
    const clientId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (typeof clientId !== 'string' || clientId.length === 0) {
      throw new BadRequestException('X-Client-Id header is required');
    }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    // Fail closed: an unknown Client and a non-owner are indistinguishable
    // (no existence leak). The binding is the ONLY ownership proof.
    if (!client || client.ownerUserId !== user.sub) {
      throw new ForbiddenException('Client access denied');
    }

    // Locked: operational access requires completed onboarding.
    if (client.onboardingStatus !== 'ACTIVE') {
      throw new ForbiddenException('Client onboarding is pending');
    }

    request.client = client;
    return true;
  }
}