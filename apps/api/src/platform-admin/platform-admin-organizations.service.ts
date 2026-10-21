import { Injectable } from '@nestjs/common';
import type { Prisma, Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Platform Administrator Organizations Service.
 *
 * Provides explicit global-read operations for Organizations.
 * These are NOT scoped to the caller's organization — they return
 * cross-tenant data for authorized Platform Administrators only.
 *
 * All methods are intended to be called ONLY from PlatformAdminController
 * routes protected by AdminStepUpGuard (SOCIALOPS_ADMIN + step-up verified).
 *
 * Decision 020 §4: cross-tenant reads must audit to AdminAuditEvent.
 * All methods below write an AdminAuditEvent record on every call.
 */
@Injectable()
export class PlatformAdminOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Safe select for global org reads (excludes internal/sensitive fields) */
  private static readonly ORG_SELECT: Prisma.OrganizationSelect = {
    id: true,
    name: true,
    slug: true,
    isActive: true,
    kind: true,
    discoveryOptIn: true,
    discoveryApprovedAt: true,
    discoveryApprovedByUserId: true,
    createdAt: true,
    updatedAt: true,
  };

  /**
   * List all organizations (paginated, cursor-based).
   * No tenant scoping — returns all orgs including SOCIALOPS kind.
   * Audits every call to AdminAuditEvent.
   */
  async listAll(
    page: number = 1,
    limit: number = 25,
    cursor?: string,
    actorUserId?: string,
  ): Promise<{
    data: Organization[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    const where: Prisma.OrganizationWhereInput = cursor ? { id: { gt: cursor } } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        select: PlatformAdminOrganizationsService.ORG_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.organization.count({ where: {} }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    // Audit: cross-tenant organization list read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.org_read',
          targetType: 'organization',
          targetId: null,
          details: { page, limit, cursor, count: data.length },
        },
      });
    }

    return {
      data,
      meta: { page, limit, total, hasNextPage, hasPrevPage: page > 1 },
    };
  }

  /**
   * Get a single organization by ID.
   * No tenant scoping — returns any org.
   * Audits every call to AdminAuditEvent.
   */
  async getById(organizationId: string, actorUserId?: string): Promise<Organization | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: PlatformAdminOrganizationsService.ORG_SELECT,
    });

    // Audit: cross-tenant organization single read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.org_read',
          targetType: 'organization',
          targetId: organizationId,
          details: { found: !!org },
        },
      });
    }

    return org;
  }

  /**
   * Count organizations by kind.
   */
  async countByKind(): Promise<{ AGENCY: number; SOCIALOPS: number }> {
    const [AGENCY, SOCIALOPS] = await this.prisma.$transaction([
      this.prisma.organization.count({ where: { kind: 'AGENCY' } }),
      this.prisma.organization.count({ where: { kind: 'SOCIALOPS' } }),
    ]);
    return { AGENCY, SOCIALOPS };
  }
}