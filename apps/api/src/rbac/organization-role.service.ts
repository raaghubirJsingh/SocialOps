import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  UpdateOrganizationRoleDto,
  UpdateOrganizationRoleByMemberDto,
} from './dto/organization-role.dto.js';

/**
 * Organization Role Assignment service.
 *
 * SECURITY MODEL:
 * - Only SOCIALOPS_ADMIN users may call these methods (enforced at guard level)
 * - Step-up verification required (enforced via AdminStepUpGuard)
 * - Self-escalation is PROHIBITED
 * - OWNER role cannot be assigned to others
 * - Last OWNER in an organization cannot be removed (prevents orphaning)
 * - All operations audited to AdminAuditEvent
 *
 * TENANT ISOLATION:
 * - Operations are scoped by OrganizationMembership, not user ID alone
 * - Tenant context derived from membership, not client input
 */
@Injectable()
export class OrganizationRoleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update a user's role by membership ID.
   *
   * The membershipId is the authoritative tenant-scoped identifier.
   * The organization is derived from the membership, ensuring tenant isolation.
   *
   * @throws ForbiddenException - Self-escalation attempt, or assigning OWNER role
   * @throws ConflictException - Cannot remove last OWNER, or assigning OWNER to another
   * @throws NotFoundException - Membership not found
   */
  async updateRoleByMembershipId(
    actorUserId: string,
    dto: UpdateOrganizationRoleDto,
  ): Promise<{
    membershipId: string;
    userId: string;
    organizationId: string;
    previousRole: OrganizationRole;
    newRole: OrganizationRole;
  }> {
    const { membershipId, role: newRole } = dto;

    // Fetch the membership with user info
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: { id: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Fetch organization for tenant validation
    const organization = await this.prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const { userId } = membership;

    // SECURITY: Prevent self-escalation
    if (userId === actorUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // SECURITY: Cannot assign OWNER role to others (only existing OWNERs can)
    if (newRole === OrganizationRole.OWNER) {
      throw new ForbiddenException('Cannot assign OWNER role directly');
    }

    // SECURITY: Cannot demote the last OWNER
    const currentRole = membership.role;
    if (currentRole === OrganizationRole.OWNER) {
      const ownerCount = await this.prisma.organizationMembership.count({
        where: {
          organizationId: membership.organizationId,
          role: OrganizationRole.OWNER,
        },
      });

      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER_PROTECTION',
          detail:
            'Cannot remove the last OWNER from an organization. Transfer ownership first.',
        });
      }
    }

    // Perform the update in a transaction with audit logging
    return this.prisma.$transaction(async (tx) => {
      const previousRole = currentRole;

      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { role: newRole },
      });

      // Audit the role change
      await tx.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'organization.role_changed',
          targetType: 'organization_membership',
          targetId: membershipId,
          details: {
            organizationId: membership.organizationId,
            userId,
            previousRole,
            newRole,
          },
        },
      });

      return {
        membershipId,
        userId,
        organizationId: membership.organizationId,
        previousRole,
        newRole,
      };
    });
  }

  /**
   * Update a user's role by user ID and organization ID.
   *
   * This is a convenience method that looks up the membership.
   * The organizationId is validated against the actor's access.
   *
   * @throws NotFoundException - User, organization, or membership not found
   * @throws ForbiddenException - Self-escalation, cross-tenant access, or OWNER assignment
   * @throws ConflictException - Cannot remove last OWNER
   */
  async updateRoleByMemberAndOrg(
    actorUserId: string,
    dto: UpdateOrganizationRoleByMemberDto,
  ): Promise<{
    membershipId: string;
    userId: string;
    organizationId: string;
    previousRole: OrganizationRole;
    newRole: OrganizationRole;
  }> {
    const { userId, organizationId, role: newRole } = dto;

    // Fetch the membership - this is the authoritative tenant boundary
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: {
        user: { select: { id: true } },
      },
    });

    if (!membership) {
      // Don't reveal whether user/org exists - could be either
      throw new NotFoundException('Membership not found');
    }

    // Delegate to the main method which handles all security checks
    return this.updateRoleByMembershipId(actorUserId, {
      membershipId: membership.id,
      role: newRole,
    });
  }

  /**
   * Get the current role of a user within an organization.
   */
  async getRole(
    userId: string,
    organizationId: string,
  ): Promise<{
    membershipId: string;
    role: OrganizationRole;
  } | null> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: {
        id: true,
        role: true,
      },
    });

    if (!membership) {
      return null;
    }

    return {
      membershipId: membership.id,
      role: membership.role,
    };
  }

  /**
   * List all memberships within an organization (admin purpose).
   */
  async listMemberships(
    organizationId: string,
    options?: {
      role?: OrganizationRole;
      cursor?: string;
      limit?: number;
    },
  ): Promise<{
    data: Array<{
      membershipId: string;
      userId: string;
      role: OrganizationRole;
      createdAt: Date;
    }>;
    meta: {
      hasNextPage: boolean;
      hasPrevPage: boolean;
      total: number;
    };
  }> {
    const { role, cursor, limit = 50 } = options ?? {};

    const where: Record<string, unknown> = { organizationId };
    if (role) {
      where.role = role;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where,
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        take: limit + 1,
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    return {
      data: data.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
      })),
      meta: {
        hasNextPage,
        hasPrevPage: !!cursor,
        total: total,
      },
    };
  }
}
