import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { RequestOrganizationContext } from '../decorators/current-organization.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface AgencyAccessRequest extends Request {
  organization?: RequestOrganizationContext;
}

/**
 * Agency-only access guard.
 *
 * Runs after OrganizationMembershipGuard has attached the verified
 * organization context. It does not perform JWT verification or tenant
 * resolution; it only enforces that the verified organization is an
 * Agency and has completed manual verification.
 */
@Injectable()
export class AgencyAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AgencyAccessRequest>();

    const organization = request.organization;
    if (!organization) {
      throw new ForbiddenException('Organization context required');
    }

    const verifiedOrganization = await this.prisma.organization.findUnique({
      where: { id: organization.id },
      select: { kind: true, verificationStatus: true },
    });

    if (
      !verifiedOrganization ||
      verifiedOrganization.kind !== 'AGENCY' ||
      verifiedOrganization.verificationStatus !== 'VERIFIED'
    ) {
      throw new ForbiddenException('Agency access denied');
    }

    return true;
  }
}
