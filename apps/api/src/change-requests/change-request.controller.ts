import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ClientsService } from '../clients/clients.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentOrganization,
  type RequestOrganizationContext,
} from '../rbac/decorators/current-organization.decorator.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { RequireMinimumRole } from '../rbac/decorators/require-roles.decorator.js';
import { RoleGuard } from '../rbac/guards/role.guard.js';
import { Decision009ChangeRequestService } from './change-request.service.js';
import type { ContentTransitionActor } from '../content/constants/content-transitions.js';

/**
 * Maps a verified organization role to a transition authority actor.
 * Only OWNER and ADMIN pass the RoleGuard (@RequireMinimumRole('ADMIN')),
 * and both act as AGENCY_ADMIN in the authority matrix.
 */
function organizationRoleToActor(role: string): ContentTransitionActor {
  if (role !== 'OWNER' && role !== 'ADMIN') {
    throw new ForbiddenException('Minimum organization role required: ADMIN');
  }
  return 'AGENCY_ADMIN';
}
import { createChangeRequestSchema } from './dto/create-change-request.dto.js';
import type { Decision009CreateChangeRequestDto } from './dto/create-change-request.dto.js';
import { confirmChangeRequestSchema } from './dto/confirm-change-request.dto.js';
import type { Decision009ConfirmChangeRequestDto } from './dto/confirm-change-request.dto.js';

/**
 * Decision 009 Change Request lifecycle endpoints.
 *
 * Authorization chain (identical to the agency-side ContentController):
 * global JwtAuthGuard -> global OrganizationMembershipGuard (verified
 * `X-Organization-Id`) -> RoleGuard + @RequireMinimumRole('ADMIN') on every
 * mutation -> requireClientInScope() proving an ACTIVE
 * ClientAgencyRelationship (uniform 404 otherwise).
 *
 * The AGENCY acts as 'AGENCY_ADMIN' in the authority matrix. The two
 * endpoints implement the approved Decision 009 status machine:
 *   create  : DRAFT -> UNDER_CLIENT_REVIEW
 *   confirm : UNDER_CLIENT_REVIEW -> AWAITING_MANAGER_APPROVAL
 *
 * Decision 009 wiring: this controller is registered through
 * `ChangeRequestModule` in `app.module.ts`.
 */
@ApiTags('change-requests')
@ApiBearerAuth()
@Controller('clients/:clientId/content/:contentId/change-requests')
export class ChangeRequestController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly changeRequestService: Decision009ChangeRequestService,
  ) {}

  /**
   * Create a change request for a Content item.
   *
   * Requires the Content to be in DRAFT status. On success the Content
   * transitions to UNDER_CLIENT_REVIEW atomically with the change-request
   * row inside a Prisma transaction.
   */
  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Create a change request and move Content to UNDER_CLIENT_REVIEW.',
    description:
      'Requires the Content to be in DRAFT status. Creates the change-request row and transitions the Content to UNDER_CLIENT_REVIEW in a single transaction.',
  })
  @ApiCreatedResponse({ description: 'The created ChangeRequest row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER/ADMIN role.' })
  @ApiNotFoundResponse({
    description: 'Client or Content not found for this organization.',
  })
  async createChangeRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(createChangeRequestSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    const body = dto as Decision009CreateChangeRequestDto;
    return this.changeRequestService.createChangeRequest({
      organizationId: organization.id,
      clientId,
      contentId,
      actorUserId: user.sub,
      actorRole: organizationRoleToActor(organization.role),
      requestDetails: body.requestDetails,
    });
  }

  /**
   * Confirm a change request.
   *
   * Requires the Content to be in UNDER_CLIENT_REVIEW status. On success
   * the Content transitions to AWAITING_MANAGER_APPROVAL atomically with
   * the status-event audit row inside a Prisma transaction.
   */
  @Patch(':changeRequestId/confirm')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Confirm a change request and move Content to AWAITING_MANAGER_APPROVAL.',
    description:
      'Requires the Content to be in UNDER_CLIENT_REVIEW status. Transitions the Content to AWAITING_MANAGER_APPROVAL and records a ContentStatusEvent in a single transaction.',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER/ADMIN role.' })
  @ApiNotFoundResponse({
    description: 'Change request or Content not found for this organization.',
  })
  async confirmChangeRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('changeRequestId', ParseUUIDPipe) changeRequestId: string,
    @Body(new ZodValidationPipe(confirmChangeRequestSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    const body = dto as Decision009ConfirmChangeRequestDto;
    return this.changeRequestService.confirmChangeRequest({
      organizationId: organization.id,
      clientId,
      changeRequestId,
      actorUserId: user.sub,
      actorRole: organizationRoleToActor(organization.role),
      note: body.note,
    });
  }

  private async requireClientInScope(
    clientId: string,
    organizationId: string,
  ) {
    const client = await this.clientsService.getClientForOrganization(
      clientId,
      organizationId,
    );
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
}
