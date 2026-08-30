import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ResolvedOrganizationContext {
  id: string;
  role: OrganizationRole;
}

/**
 * Stage B7 organization context resolver.
 *
 * Validates that a given user actually belongs to a given organization
 * and returns the membership's role. This is the single authoritative
 * place where an authenticated user's organization role is read from
 * PostgreSQL on each protected organization-level request (the JWT
 * itself does not carry any organization / role claim - AGENTS.md
 * section 7 / B7 plan).
 *
 * Security rules (AGENTS.md section 7):
 *
 *   - Tenant isolation is enforced server-side.
 *   - Roles are NEVER accepted from the client, the body, the query
 *     string, a custom header, or a JWT claim - they are only ever
 *     read from the OrganizationMembership row matching (userId,
 *     organizationId).
 *   - Membership existence is the only B7 gate; Organization.isActive
 *     is not consulted (deferred).
 */
@Injectable()
export class OrganizationContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a user's verified organization context.
   *
   * Constrained by BOTH `userId` and `organizationId` - the query
   * cannot return rows for a different user or a different
   * organization. This is the tenant-isolation boundary.
   *
   * Throws `ForbiddenException` (with the standard B7 message) when
   * the user is not a member of the requested organization.
   */
  async resolve(
    userId: string,
    organizationId: string,
  ): Promise<ResolvedOrganizationContext> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of the requested organization');
    }

    return { id: organizationId, role: membership.role };
  }
}
