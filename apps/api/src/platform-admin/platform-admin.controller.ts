import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import type { AdminAuditEvent } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { AdminStepUpGuard } from '../admin/guards/admin-step-up.guard.js';
import { PlatformPermissionGuard } from './guards/platform-permission.guard.js';
import { RequirePlatformPermission } from './dto/platform-permission.constants.js';
import { PlatformAdminService, PaginatedPlatformAdmins, PlatformAdminInfo } from './platform-admin.service.js';
import { PlatformAdminOrganizationsService } from './platform-admin-organizations.service.js';
import { PlatformAdminUsersService } from './platform-admin-users.service.js';
import { PlatformAdminClientsService } from './platform-admin-clients.service.js';
import { PlatformAdminEmployeesService } from './platform-admin-employees.service.js';
import {
  grantPlatformAdminSchema,
  revokePlatformAdminSchema,
  bootstrapPlatformAdminSchema,
  platformAdminListQuerySchema,
} from './dto/platform-admin.dto.js';
import type {
  GrantPlatformAdminDto,
  RevokePlatformAdminDto,
  BootstrapPlatformAdminDto,
  PlatformAdminListQueryDto,
} from './dto/platform-admin.dto.js';

/**
 * Platform Administrator controller.
 *
 * Route access (Decision 020):
 * - POST /admin/platform-admins/bootstrap  — Fully public (no auth, no step-up)
 * - All other routes require step-up OTP verification (AdminStepUpGuard)
 *   which validates a short-lived session token issued after successful
 *   step-up OTP verification.
 * - All protected routes also enforce per-permission checks via
 *   PlatformPermissionGuard and @RequirePlatformPermission decorator.
 *
 * Routes:
 * Platform Admin Management:
 * - POST /admin/platform-admins/bootstrap  — One-time first admin bootstrap (public)
 * - POST /admin/platform-admins/grant      — Grant platform admin (PLATFORM_ROLE_GRANT)
 * - POST /admin/platform-admins/revoke     — Revoke platform admin (PLATFORM_ROLE_REVOKE)
 * - GET  /admin/platform-admins            — List platform admins (PLATFORM_ROLE_GRANT, PLATFORM_ROLE_REVOKE)
 * - GET  /admin/platform-admins/:id        — Get single platform admin (PLATFORM_ROLE_GRANT, PLATFORM_ROLE_REVOKE)
 *
 * Global Read Endpoints (cross-tenant, safe fields only, audited to AdminAuditEvent):
 * - GET /admin/organizations               — List all organizations (GLOBAL_ORG_READ)
 * - GET /admin/organizations/:id           — Get single organization (GLOBAL_ORG_READ)
 * - GET /admin/users                       — List all users (GLOBAL_USER_READ)
 * - GET /admin/users/:id                   — Get single user (GLOBAL_USER_READ)
 * - GET /admin/clients                     — List all clients (GLOBAL_CLIENT_READ)
 * - GET /admin/clients/:id                 — Get single client (GLOBAL_CLIENT_READ)
 * - GET /admin/employees                   — List all employee profiles (GLOBAL_EMPLOYEE_READ)
 *
 * Decision 020 §4 field exclusions applied:
 * - User.phone excluded from all user reads
 * - Client.notes excluded from all client reads
 * - All sensitive PII (directEmail, directPhone, addresses, etc.) excluded by default
 * - Password hashes, token hashes, SocialAccountCredential, InternalNote.body, Content.body
 *   never included in any global-read endpoint
 */
@Controller('admin')
@Public()
export class PlatformAdminController {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
    private readonly organizationsService: PlatformAdminOrganizationsService,
    private readonly usersService: PlatformAdminUsersService,
    private readonly clientsService: PlatformAdminClientsService,
    private readonly employeesService: PlatformAdminEmployeesService,
  ) {}

  // ============================================
  // Platform Admin Management
  // ============================================

  /**
   * Bootstrap the first platform administrator.
   * Fails if any platform admin already exists.
   * Grants all permissions by default.
   */
  @Post('platform-admins/bootstrap')
  @HttpCode(201)
  @Public()
  async bootstrap(
    @Body(new ZodValidationPipe(bootstrapPlatformAdminSchema)) dto: BootstrapPlatformAdminDto,
  ): Promise<PlatformAdminInfo> {
    // For bootstrap, we don't have a user yet - we'll create the first admin
    // The service will handle checking if any admin already exists
    return this.platformAdminService.bootstrapFirstAdmin(null, dto);
  }

  /**
   * Grant platform admin to a user.
   */
  @Post('platform-admins/grant')
  @HttpCode(201)
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('PLATFORM_ROLE_GRANT')
  async grant(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(grantPlatformAdminSchema)) dto: GrantPlatformAdminDto,
  ): Promise<PlatformAdminInfo> {
    return this.platformAdminService.grantAdmin(user.sub, dto);
  }

  /**
   * Revoke platform admin from a user.
   * Prohibits self-revoke and revoking the last admin.
   * Also revokes all refresh tokens for immediate session invalidation.
   */
  @Post('platform-admins/revoke')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('PLATFORM_ROLE_REVOKE')
  async revoke(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(revokePlatformAdminSchema)) dto: RevokePlatformAdminDto,
  ): Promise<PlatformAdminInfo> {
    return this.platformAdminService.revokeAdmin(user.sub, dto);
  }

  /**
   * List all platform administrators (paginated).
   */
  @Get('platform-admins')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('PLATFORM_ROLE_GRANT', 'PLATFORM_ROLE_REVOKE')
  async listAdmins(
    @CurrentUser() user: JwtAccessPayload,
    @Query(new ZodValidationPipe(platformAdminListQuerySchema)) query: PlatformAdminListQueryDto,
  ): Promise<PaginatedPlatformAdmins> {
    return this.platformAdminService.listAdmins(query);
  }

  /**
   * Get a single platform administrator by ID.
   */
  @Get('platform-admins/:id')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('PLATFORM_ROLE_GRANT', 'PLATFORM_ROLE_REVOKE')
  async getAdmin(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlatformAdminInfo | null> {
    return this.platformAdminService.getAdmin(id);
  }

  // ============================================
  // Global Read: Organizations
  // ============================================

  @Get('organizations')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_ORG_READ')
  async listOrganizations(
    @CurrentUser() user: JwtAccessPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.organizationsService.listAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
      cursor,
      user.sub,
    );
  }

  @Get('organizations/:id')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_ORG_READ')
  async getOrganization(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.organizationsService.getById(id, user.sub);
  }

  // ============================================
  // Global Read: Users
  // ============================================

  @Get('users')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_USER_READ')
  async listUsers(
    @CurrentUser() user: JwtAccessPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.listAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
      cursor,
      user.sub,
    );
  }

  @Get('users/:id')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_USER_READ')
  async getUser(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.getById(id, user.sub);
  }

  // ============================================
  // Global Read: Clients (Safe fields by default)
  // ============================================

  @Get('clients')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_CLIENT_READ')
  async listClients(
    @CurrentUser() user: JwtAccessPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('includeSensitive') includeSensitive?: string,
  ) {
    return this.clientsService.listAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
      cursor,
      includeSensitive === 'true',
      user.sub,
    );
  }

  @Get('clients/:id')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_CLIENT_READ')
  async getClient(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeSensitive') includeSensitive?: string,
  ) {
    return this.clientsService.getById(id, includeSensitive === 'true', user.sub);
  }

  // ============================================
  // Global Read: Employees
  // ============================================

  @Get('employees')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('GLOBAL_EMPLOYEE_READ')
  async listEmployees(
    @CurrentUser() user: JwtAccessPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.employeesService.listAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
      cursor,
      user.sub,
    );
  }

  // ============================================
  // Global Read: Audit Logs
  // ============================================

  /**
   * List cross-tenant audit events (paginated, cursor-based).
   * Returns the insert-only AdminAuditEvent trail.
   * Requires PLATFORM_AUDIT_READ permission.
   */
  @Get('audit-logs')
  @UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('PLATFORM_AUDIT_READ')
  async listAuditLogs(
    @CurrentUser() user: JwtAccessPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
  ): Promise<{
    data: AdminAuditEvent[];
    meta: { page: number; limit: number; total: number; hasNextPage: boolean; hasPrevPage: boolean };
  }> {
    return this.platformAdminService.listAuditLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
      cursor,
      action,
      targetType,
      user.sub,
    );
  }
}