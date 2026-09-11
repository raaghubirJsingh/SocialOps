import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Organization } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Agency discovery (approved rule): an Agency is discoverable ONLY when
 * BOTH the Agency has opted in AND SOCIALOPS_ADMIN approval has been
 * recorded. The approval is a separate platform-level authority from the
 * Agency's own OWNER/ADMIN roles.
 */
@Injectable()
export class ClientDiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public catalog source: only approved + opted-in Agencies. */
  listDiscoverableAgencies() {
    return this.prisma.organization.findMany({
      where: {
        discoveryOptIn: true,
        discoveryApprovedAt: { not: null },
      },
      select: { id: true, name: true, discoveryApprovedAt: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Agency self opt-in (org-scoped, OWNER/ADMIN route). */
  async optIn(organizationId: string): Promise<Organization> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { discoveryOptIn: true },
    });
  }

  /** SOCIALOPS_ADMIN approval (separate from Agency roles). */
  async approve(organizationId: string, adminUserId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        discoveryApprovedAt: new Date(),
        discoveryApprovedByUserId: adminUserId,
      },
    });
  }

  /** Fail-closed gate used before a Client may request an Agency. */
  async assertDiscoverable(organizationId: string): Promise<Organization> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (
      !organization ||
      !organization.discoveryOptIn ||
      !organization.discoveryApprovedAt
    ) {
      throw new ForbiddenException(
        'Agency is not discoverable (requires opt-in AND approval)',
      );
    }
    return organization;
  }
}