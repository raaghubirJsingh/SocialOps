import { Injectable } from '@nestjs/common';
import type { Prisma, EmployeeProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Platform Administrator Employees Service.
 *
 * Provides explicit global-read operations for EmployeeProfile rows.
 * These are NOT scoped to the caller's organization — they return
 * cross-tenant data for authorized Platform Administrators only.
 *
 * Employee identity is carried by the 1:1 EmployeeProfile extension of
 * User (AGENTS.md §17.1). This service joins EmployeeProfile with the
 * User's non-secret identity fields (id, email, fullName, phone).
 *
 * Sensitive fields (passwordHash, token hashes) are ALWAYS excluded.
 *
 * All methods are intended to be called ONLY from PlatformAdminController
 * routes protected by AdminStepUpGuard (SOCIALOPS_ADMIN + step-up verified).
 *
 * Decision 020 §4: cross-tenant reads must audit to AdminAuditEvent.
 * All methods below write an AdminAuditEvent record on every call.
 */
@Injectable()
export class PlatformAdminEmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all employee profiles (paginated, cursor-based).
   * Joins EmployeeProfile with User for non-secret identity fields.
   * No tenant scoping — returns all employee profiles.
   * Audits every call to AdminAuditEvent.
   */
  async listAll(
    page: number = 1,
    limit: number = 25,
    cursor?: string,
    actorUserId?: string,
  ): Promise<{
    data: {
      id: string;
      userId: string;
      fullName: string | null;
      email: string;
      phone: string | null;
      createdAt: Date;
      updatedAt: Date;
    }[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    const where: Prisma.EmployeeProfileWhereInput = cursor
      ? { id: { gt: cursor } }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        where,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.employeeProfile.count({ where: {} }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    // Audit: cross-tenant employee list read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.employee_read',
          targetType: 'employeeProfile',
          targetId: null,
          details: { page, limit, cursor, count: data.length },
        },
      });
    }

    return {
      data: data.map((row) => ({
        id: row.id,
        userId: row.userId,
        fullName: row.user?.fullName ?? null,
        email: row.user?.email ?? '',
        phone: row.user?.phone ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: { page, limit, total, hasNextPage, hasPrevPage: page > 1 },
    };
  }
}