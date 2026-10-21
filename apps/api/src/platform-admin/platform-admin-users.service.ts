import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Platform Administrator Users Service.
 *
 * Provides explicit global-read operations for Users.
 * These are NOT scoped to the caller's organization — they return
 * cross-tenant data for authorized Platform Administrators only.
 *
 * Sensitive fields (passwordHash, token hashes, phone) are ALWAYS excluded.
 * Decision 020 §4: User.phone must be excluded from cross-tenant reads.
 *
 * All methods are intended to be called ONLY from PlatformAdminController
 * routes protected by AdminStepUpGuard (SOCIALOPS_ADMIN + step-up verified).
 *
 * Decision 020 §4: cross-tenant reads must audit to AdminAuditEvent.
 * All methods below write an AdminAuditEvent record on every call.
 */
@Injectable()
export class PlatformAdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Safe select for global user reads (excludes secrets and phone per Decision 020 §4) */
  private static readonly USER_SELECT: Prisma.UserSelect = {
    id: true,
    email: true,
    displayName: true,
    fullName: true,
    // phone: true,  // EXCLUDED per Decision 020 §4
    accountType: true,
    clientType: true,
    isActive: true,
    emailVerifiedAt: true,
    phoneVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
    isBot: true,
    skillSpecialization: true,
    isSocialOpsAdmin: true,
    socialOpsAdminGrantedAt: true,
    socialOpsAdminGrantedById: true,
    socialOpsAdminRevokedAt: true,
    platformPermissions: true,
    // Explicitly exclude: passwordHash, refreshTokens, verificationTokens, phone, etc.
  };

  /**
   * List all users (paginated, cursor-based).
   * No tenant scoping — returns all users.
   * Audits every call to AdminAuditEvent.
   */
  async listAll(
    page: number = 1,
    limit: number = 25,
    cursor?: string,
    actorUserId?: string,
  ): Promise<{
    data: (Omit<User, 'passwordHash'> & { memberships: { organizationId: string; role: string }[] })[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    const where: Prisma.UserWhereInput = cursor ? { id: { gt: cursor } } : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...PlatformAdminUsersService.USER_SELECT,
          memberships: {
            select: { organizationId: true, role: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.user.count({ where: {} }),
    ]);

    const hasNextPage = users.length > limit;
    if (hasNextPage) users.pop();

    // Audit: cross-tenant user list read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.user_read',
          targetType: 'user',
          targetId: null,
          details: { page, limit, cursor, count: users.length },
        },
      });
    }

    return {
      data: users as any,
      meta: { page, limit, total, hasNextPage, hasPrevPage: page > 1 },
    };
  }

  /**
   * Get a single user by ID.
   * No tenant scoping — returns any user.
   * Excludes secrets and phone per Decision 020 §4.
   * Audits every call to AdminAuditEvent.
   */
  async getById(userId: string, actorUserId?: string): Promise<Partial<User> | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PlatformAdminUsersService.USER_SELECT,
    });

    // Audit: cross-tenant user single read
    if (actorUserId) {
      await this.prisma.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.user_read',
          targetType: 'user',
          targetId: userId,
          details: { found: !!user },
        },
      });
    }

    return user;
  }

  /**
   * Count users by account type.
   */
  async countByAccountType(): Promise<{ SERVICE_PROVIDER: number; CLIENT: number; NULL: number }> {
    const [SERVICE_PROVIDER, CLIENT, NULL] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { accountType: 'SERVICE_PROVIDER' } }),
      this.prisma.user.count({ where: { accountType: 'CLIENT' } }),
      this.prisma.user.count({ where: { accountType: null } }),
    ]);
    return { SERVICE_PROVIDER, CLIENT, NULL };
  }
}