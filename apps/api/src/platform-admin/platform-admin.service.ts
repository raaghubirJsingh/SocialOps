import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminAuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { GrantPlatformAdminDto, RevokePlatformAdminDto, BootstrapPlatformAdminDto, PlatformAdminListQueryDto, ALL_PLATFORM_PERMISSIONS } from './dto/platform-admin.dto.js';
import type { PlatformPermission } from '@prisma/client';

export interface PlatformAdminInfo {
  id: string;
  email: string;
  fullName: string | null;
  isSocialOpsAdmin: boolean;
  platformPermissions: PlatformPermission[];
  socialOpsAdminGrantedAt: Date | null;
  socialOpsAdminGrantedById: string | null;
  socialOpsAdminRevokedAt: Date | null;
}

export interface PaginatedPlatformAdmins {
  data: PlatformAdminInfo[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Platform Administrator service.
 *
 * Manages the bootstrap, grant, revoke, and listing of platform administrators.
 * All operations are audited in AdminAuditEvent.
 *
 * Security rules:
 * - Only existing platform admins (SOCIALOPS_ADMIN) can perform grant/revoke/list
 * - Bootstrap is a one-time operation: fails if any platform admin already exists
 * - Last platform admin cannot be revoked (prevents lockout)
 * - Self-revoke is prohibited
 * - Self-grant is prohibited
 * - All operations audit to AdminAuditEvent with actor, target, and details
 */
@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Bootstrap the first platform administrator.
   * Idempotent: fails if any user already has isSocialOpsAdmin = true.
   * Grants all permissions by default.
   */
  async bootstrapFirstAdmin(actorUserId: string | null, dto: BootstrapPlatformAdminDto): Promise<PlatformAdminInfo> {
    const { userId: targetUserId } = dto;

    // For bootstrap, there is no actor (no existing admin), so self-bootstrap check doesn't apply
    // Only check for self-bootstrap if actorUserId is provided (non-bootstrap case)
    if (actorUserId !== null && targetUserId === actorUserId) {
      throw new ForbiddenException('Cannot bootstrap self as platform admin');
    }

    // Check if any platform admin already exists
    const existingAdmin = await this.prisma.user.findFirst({
      where: { isSocialOpsAdmin: true },
      select: { id: true },
    });

    if (existingAdmin) {
      throw new ConflictException({
        code: 'PLATFORM_ADMIN_EXISTS',
        detail: 'A platform administrator already exists. Use grant/revoke instead.',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, fullName: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSocialOpsAdmin: true,
          socialOpsAdminGrantedAt: new Date(),
          // For bootstrap, there is no granting user, so set to null
          socialOpsAdminGrantedById: actorUserId ?? null,
          platformPermissions: ALL_PLATFORM_PERMISSIONS,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSocialOpsAdmin: true,
          platformPermissions: true,
          socialOpsAdminGrantedAt: true,
          socialOpsAdminGrantedById: true,
          socialOpsAdminRevokedAt: true,
        },
      });

      await tx.adminAuditEvent.create({
        data: {
          // For bootstrap, the target user IS the actor creating their own initial state
          actorUserId: actorUserId ?? targetUserId,
          action: 'platform_admin.bootstrap',
          targetType: 'user',
          targetId: targetUserId,
          details: { permissions: ALL_PLATFORM_PERMISSIONS },
        },
      });

      return updated as PlatformAdminInfo;
    });
  }

  /**
   * Grant platform admin to a user.
   * Requires actor to be existing platform admin.
   */
  async grantAdmin(actorUserId: string, dto: GrantPlatformAdminDto): Promise<PlatformAdminInfo> {
    const { userId: targetUserId, permissions = ALL_PLATFORM_PERMISSIONS } = dto;

    if (targetUserId === actorUserId) {
      throw new ForbiddenException('Cannot grant platform admin to self');
    }

    // Verify actor is platform admin
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { isSocialOpsAdmin: true },
    });
    if (!actor?.isSocialOpsAdmin) {
      throw new ForbiddenException('Only platform administrators can grant platform admin');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, fullName: true, isSocialOpsAdmin: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSocialOpsAdmin: true,
          socialOpsAdminGrantedAt: new Date(),
          socialOpsAdminGrantedById: actorUserId,
          platformPermissions: permissions,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSocialOpsAdmin: true,
          platformPermissions: true,
          socialOpsAdminGrantedAt: true,
          socialOpsAdminGrantedById: true,
          socialOpsAdminRevokedAt: true,
        },
      });

      await tx.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.granted',
          targetType: 'user',
          targetId: targetUserId,
          details: { permissions },
        },
      });

      return updated as PlatformAdminInfo;
    });
  }

  /**
   * Revoke platform admin from a user.
   * Requires actor to be existing platform admin.
   * Prohibits: self-revoke, revoking last admin.
   * Also revokes all refresh tokens for immediate session invalidation.
   */
  async revokeAdmin(actorUserId: string, dto: RevokePlatformAdminDto): Promise<PlatformAdminInfo> {
    const { userId: targetUserId } = dto;

    if (targetUserId === actorUserId) {
      throw new ForbiddenException('Cannot revoke platform admin from self');
    }

    // Verify actor is platform admin
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { isSocialOpsAdmin: true },
    });
    if (!actor?.isSocialOpsAdmin) {
      throw new ForbiddenException('Only platform administrators can revoke platform admin');
    }

    // Count current admins (excluding already revoked)
    const adminCount = await this.prisma.user.count({
      where: {
        isSocialOpsAdmin: true,
        socialOpsAdminRevokedAt: null,
      },
    });

    // Prevent revoking the last active admin
    if (adminCount <= 1) {
      throw new ConflictException({
        code: 'LAST_PLATFORM_ADMIN',
        detail: 'Cannot revoke the last platform administrator. At least one must remain.',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, fullName: true, isSocialOpsAdmin: true, socialOpsAdminRevokedAt: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (!targetUser.isSocialOpsAdmin) {
      throw new ConflictException({
        code: 'NOT_PLATFORM_ADMIN',
        detail: 'User is not a platform administrator',
      });
    }

    if (targetUser.socialOpsAdminRevokedAt !== null) {
      throw new ConflictException({
        code: 'ALREADY_REVOKED',
        detail: 'Platform admin already revoked',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSocialOpsAdmin: false,
          socialOpsAdminRevokedAt: new Date(),
          platformPermissions: [],
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSocialOpsAdmin: true,
          platformPermissions: true,
          socialOpsAdminGrantedAt: true,
          socialOpsAdminGrantedById: true,
          socialOpsAdminRevokedAt: true,
        },
      });

      await tx.adminAuditEvent.create({
        data: {
          actorUserId,
          action: 'platform_admin.revoked',
          targetType: 'user',
          targetId: targetUserId,
          details: {},
        },
      });

      // Also revoke all refresh tokens for immediate session invalidation
      await this.authService.revokeAllUserTokens(targetUserId);

      return updated as PlatformAdminInfo;
    });
  }

  /**
   * List all platform administrators with pagination.
   */
  async listAdmins(query: PlatformAdminListQueryDto): Promise<PaginatedPlatformAdmins> {
    const page: number = query.page ?? 1;
    const limit: number = query.limit ?? 25;
    const cursor = query.cursor;

    const where: Prisma.UserWhereInput = {
      isSocialOpsAdmin: true,
      ...(cursor ? { id: { gt: cursor } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          isSocialOpsAdmin: true,
          platformPermissions: true,
          socialOpsAdminGrantedAt: true,
          socialOpsAdminGrantedById: true,
          socialOpsAdminRevokedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to determine hasNextPage
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.user.count({ where: { isSocialOpsAdmin: true } }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    return {
      data: data as PlatformAdminInfo[],
      meta: {
        page,
        limit,
        total,
        hasNextPage,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get a single platform admin by ID.
   */
  async getAdmin(userId: string): Promise<PlatformAdminInfo | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isSocialOpsAdmin: true,
        platformPermissions: true,
        socialOpsAdminGrantedAt: true,
        socialOpsAdminGrantedById: true,
        socialOpsAdminRevokedAt: true,
      },
    }) as Promise<PlatformAdminInfo | null>;
  }

  /**
   * List cross-tenant audit events (paginated, cursor-based).
   * Returns the insert-only AdminAuditEvent trail.
   * Supports optional filtering by action and targetType.
   */
  async listAuditLogs(
    page: number = 1,
    limit: number = 25,
    cursor?: string,
    action?: string,
    targetType?: string,
    actorUserId?: string,
  ): Promise<{
    data: AdminAuditEvent[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    const where: Prisma.AdminAuditEventWhereInput = {
      ...(cursor ? { id: { gt: cursor } } : {}),
      ...(action ? { action: { contains: action } } : {}),
      ...(targetType ? { targetType } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.adminAuditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      this.prisma.adminAuditEvent.count({ where }),
    ]);

    const hasNextPage = data.length > limit;
    if (hasNextPage) data.pop();

    return {
      data,
      meta: { page, limit, total, hasNextPage, hasPrevPage: page > 1 },
    };
  }
}