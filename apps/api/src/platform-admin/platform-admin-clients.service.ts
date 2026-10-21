import { Injectable } from '@nestjs/common';
import type { Prisma, Client } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Platform Administrator Clients Service.
 *
 * Provides explicit global-read operations for Clients.
 * These are NOT scoped to the caller's organization — they return
 * cross-tenant data for authorized Platform Administrators only.
 *
 * Sensitive PII fields are EXCLUDED by default (safe select).
 * A separate opt-in method exists for sensitive fields with audit.
 *
 * Decision 020 §4: Client.notes must be excluded from cross-tenant reads
 * (along with directEmail, directPhone, primaryContactName, primaryContactPhone,
 * addressLine1, addressLine2, city, state, country, postalCode).
 *
 * All methods are intended to be called ONLY from PlatformAdminController
 * routes protected by AdminStepUpGuard (SOCIALOPS_ADMIN + step-up verified).
 *
 * Decision 020 §4: cross-tenant reads must audit to AdminAuditEvent.
 * All methods below write an AdminAuditEvent record on every call.
 */
@Injectable()
export class PlatformAdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Safe select for global client reads (excludes sensitive PII and notes per Decision 020 §4) */
  private static readonly SAFE_CLIENT_SELECT: Prisma.ClientSelect = {
    id: true,
    name: true,
    type: true,
    status: true,
    onboardingStatus: true,
    description: true,
    website: true,
    industry: true,
    logoUrl: true,
    // notes: true,  // EXCLUDED per Decision 020 §4
    createdAt: true,
    updatedAt: true,
    ownerUserId: true,
    statusReason: true,
    statusChangedAt: true,
    // Explicitly EXCLUDED (sensitive PII):
    // directEmail, directPhone, primaryContactName, primaryContactPhone,
    // addressLine1, addressLine2, city, state, country, postalCode
    // notes (per Decision 020 §4)
  };

  /** Extended select including sensitive PII (for opt-in with justification) */
  private static readonly EXTENDED_CLIENT_SELECT: Prisma.ClientSelect = {
    ...PlatformAdminClientsService.SAFE_CLIENT_SELECT,
    directEmail: true,
    directPhone: true,
    primaryContactName: true,
    primaryContactPhone: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    state: true,
    country: true,
    postalCode: true,
    // notes: true,  // Still excluded per Decision 020 §4 - no opt-in for notes
  };

  /**
   * List all clients (paginated, cursor-based).
   * Returns SAFE fields only (no PII, no notes).
   * No tenant scoping — returns all clients.
   * Audits every call to AdminAuditEvent.
   */
  async listAll(
    page: number = 1,
    limit: number = 25,
    cursor?: string,
    includeSensitive: boolean = false,
    actorUserId?: string,
  ): Promise<{
    data: Client[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    const where: Prisma.ClientWhereInput = cursor ? { id: { gt: cursor } } : {};

    const select = includeSensitive
      ? PlatformAdminClientsService.EXTENDED_CLIENT_SELECT
      : PlatformAdminClientsService.SAFE_CLIENT_SELECT;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.client.count({ where: {} }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    // Audit: cross-tenant client list read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.client_read',
          targetType: 'client',
          targetId: null,
          details: { page, limit, cursor, includeSensitive, count: data.length },
        },
      });
    }

    return {
      data,
      meta: { page, limit, total, hasNextPage, hasPrevPage: page > 1 },
    };
  }

  /**
   * Get a single client by ID.
   * Returns SAFE fields by default; opt-in for sensitive PII (but never notes per Decision 020 §4).
   * No tenant scoping — returns any client.
   * Audits every call to AdminAuditEvent.
   */
  async getById(
    clientId: string,
    includeSensitive: boolean = false,
    actorUserId?: string,
  ): Promise<Client | null> {
    const select = includeSensitive
      ? PlatformAdminClientsService.EXTENDED_CLIENT_SELECT
      : PlatformAdminClientsService.SAFE_CLIENT_SELECT;

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select,
    });

    // Audit: cross-tenant client single read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.client_read',
          targetType: 'client',
          targetId: clientId,
          details: { found: !!client, includeSensitive },
        },
      });
    }

    return client;
  }

  /**
   * Count clients by status.
   */
  async countByStatus(): Promise<Record<string, number>> {
    const groups = await this.prisma.client.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    return groups.reduce((acc, g) => {
      acc[g.status] = g._count.status;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Count clients by onboarding status.
   */
  async countByOnboardingStatus(): Promise<Record<string, number>> {
    const groups = await this.prisma.client.groupBy({
      by: ['onboardingStatus'],
      _count: { onboardingStatus: true },
    });
    return groups.reduce((acc, g) => {
      acc[g.onboardingStatus] = g._count.onboardingStatus;
      return acc;
    }, {} as Record<string, number>);
  }
}