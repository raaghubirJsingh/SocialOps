import {
  BadRequestException,
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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminStepUpGuard } from '../admin/guards/admin-step-up.guard.js';
import { PlatformPermissionGuard } from '../platform-admin/guards/platform-permission.guard.js';
import { RequirePlatformPermission } from '../platform-admin/dto/platform-permission.constants.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';

import { OrganizationRoleService } from './organization-role.service.js';
import {
  updateOrganizationRoleSchema,
  updateOrganizationRoleByMemberSchema,
} from './dto/organization-role.dto.js';
import type {
  UpdateOrganizationRoleDto,
  UpdateOrganizationRoleByMemberDto,
} from './dto/organization-role.dto.js';

/**
 * Organization Role Assignment controller.
 *
 * Route access:
 * - POST /rbac/organizations/:orgId/memberships/:membershipId/role
 *   - Requires SOCIALOPS_ADMIN with PLATFORM_ROLE_GRANT permission
 *   - Requires step-up OTP verification (AdminStepUpGuard)
 *
 * - POST /rbac/organizations/:orgId/members/:userId/role
 *   - Alternative endpoint using user ID instead of membership ID
 *   - Requires same permissions
 *
 * - GET /rbac/organizations/:orgId/members
 *   - List all members of an organization
 *   - Requires same permissions
 *
 * Security rules:
 * - Self-escalation is prohibited
 * - OWNER role cannot be assigned directly (only existing OWNERs can promote)
 * - Last OWNER cannot be removed
 * - All operations audited to AdminAuditEvent
 */
@ApiTags('rbac')
@ApiBearerAuth()
@Controller('rbac/organizations')
@UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
@RequirePlatformPermission('PLATFORM_ROLE_GRANT')
export class OrganizationRoleController {
  constructor(private readonly roleService: OrganizationRoleService) {}

  /**
   * Update a user's role within an organization by membership ID.
   *
   * Security: The membership ID is the authoritative tenant-scoped identifier.
   * Self-escalation is prohibited. OWNER role assignment is not permitted.
   */
  @Post(':orgId/memberships/:membershipId/role')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update a user role by membership ID',
    description:
      'Updates a user\'s role within an organization. The membership ID is the authoritative tenant-scoped identifier. Self-escalation is prohibited. OWNER role cannot be assigned directly. Cannot remove the last OWNER from an organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully',
    schema: {
      type: 'object',
      properties: {
        membershipId: { type: 'string' },
        userId: { type: 'string' },
        organizationId: { type: 'string' },
        previousRole: { enum: Object.values(OrganizationRole) },
        newRole: { enum: Object.values(OrganizationRole) },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized - step-up verification required' })
  @ApiResponse({ status: 403, description: 'Forbidden - self-escalation or invalid permission' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  @ApiResponse({ status: 409, description: 'Conflict - cannot remove last OWNER' })
  async updateRoleByMembership(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateOrganizationRoleSchema)) dto: UpdateOrganizationRoleDto,
  ): Promise<{
    membershipId: string;
    userId: string;
    organizationId: string;
    previousRole: OrganizationRole;
    newRole: OrganizationRole;
  }> {
    return this.roleService.updateRoleByMembershipId(user.sub, {
      membershipId,
      role: dto.role,
    });
  }

  /**
   * Update a user's role within an organization by user ID.
   *
   * This endpoint uses user ID + organization ID to locate the membership.
   * Required for scenarios where the membership ID is not known.
   */
  @Post(':orgId/members/:userId/role')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update a user role by user ID and organization',
    description:
      'Updates a user\'s role within an organization using user ID and organization ID. Useful when the membership ID is not known. Route params must match request body.',
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid input or route/body mismatch' })
  @ApiResponse({ status: 401, description: 'Unauthorized - step-up verification required' })
  @ApiResponse({ status: 403, description: 'Forbidden - self-escalation or invalid permission' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  @ApiResponse({ status: 409, description: 'Conflict - cannot remove last OWNER' })
  async updateRoleByMember(
    @Param('orgId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateOrganizationRoleByMemberSchema)) dto: UpdateOrganizationRoleByMemberDto,
  ): Promise<{
    membershipId: string;
    userId: string;
    organizationId: string;
    previousRole: OrganizationRole;
    newRole: OrganizationRole;
  }> {
    // Validate the DTO matches the route params
    if (dto.userId !== userId || dto.organizationId !== organizationId) {
      throw new BadRequestException('Route params must match request body');
    }

    return this.roleService.updateRoleByMemberAndOrg(user.sub, dto);
  }

  /**
   * Get a user's role within an organization.
   */
  @Get(':orgId/members/:userId/role')
  @ApiOperation({
    summary: 'Get a user\'s role within an organization',
    description: 'Retrieves the current role of a user within a specific organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Role lookup result',
    schema: {
      type: 'object',
      properties: {
        membershipId: { type: 'string', nullable: true },
        role: { enum: Object.values(OrganizationRole), nullable: true },
      },
    },
  })
  async getRole(
    @Param('orgId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const result = await this.roleService.getRole(userId, organizationId);
    if (!result) {
      return { membershipId: null, role: null };
    }
    return result;
  }

  /**
   * List all members of an organization.
   *
   * Query params:
   * - role: filter by role (optional)
   * - cursor: pagination cursor (optional)
   * - limit: pagination limit (default 25)
   */
  @Get(':orgId/members')
  @ApiOperation({
    summary: 'List all members of an organization',
    description: 'Lists all organization memberships with optional role filtering and pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of members',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              membershipId: { type: 'string' },
              userId: { type: 'string' },
              role: { enum: Object.values(OrganizationRole) },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
            total: { type: 'number' },
          },
        },
      },
    },
  })
  async listMembers(
    @Param('orgId', ParseUUIDPipe) organizationId: string,
    @Query('role') role?: OrganizationRole,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.roleService.listMemberships(organizationId, {
      role: role as OrganizationRole,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}