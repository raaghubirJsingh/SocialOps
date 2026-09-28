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

  /** Public catalog source: only approved + opted-in external Agencies. */
  listDiscoverableAgencies() {
    return this.prisma.organization.findMany({
      where: {
        // Defence in depth: the platform-owned SOCIALOPS Organization is NOT
        // an external Agency and must never be offered as a user-selectable
        // choice. It is attached to a Client automatically instead. This
        // filter is the authority; `discoveryOptIn: false` alone would be a
        // single mutable value, not a guarantee.
        kind: 'AGENCY',
        discoveryOptIn: true,
        discoveryApprovedAt: { not: null },
      },
      select: { id: true, name: true, discoveryApprovedAt: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * The platform Service Provider can never be published as an external
   * Agency, no matter who asks. Applied to every write path that could put an
   * Organization into the discovery catalog.
   */
  private assertNotPlatformOrganization(organization: Organization): void {
    if (organization.kind === 'SOCIALOPS') {
      throw new ForbiddenException({
        code: 'PLATFORM_ORGANIZATION_NOT_DISCOVERABLE',
        detail:
          'The SocialOps Service Provider is attached automatically and is never published as an external Agency.',
      });
    }
  }

  /** Agency self opt-in (org-scoped, OWNER/ADMIN route). */
  async optIn(organizationId: string): Promise<Organization> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    this.assertNotPlatformOrganization(organization);
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
    this.assertNotPlatformOrganization(organization);
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
      organization.kind !== 'AGENCY' ||
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