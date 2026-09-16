import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { ContentStatusService } from './content-status.service.js';
import { ContentService } from './content.service.js';
import { createContentSchema } from './dto/create-content.dto.js';
import type { CreateContentDto } from './dto/create-content.dto.js';
import {
  listContentQuerySchema,
  normaliseListContentQuery,
  type ListContentQueryDto,
} from './dto/list-content.dto.js';
import { transitionContentSchema } from './dto/transition-content.dto.js';
import type { TransitionContentDto } from './dto/transition-content.dto.js';
import { updateContentSchema } from './dto/update-content.dto.js';
import type { UpdateContentDto } from './dto/update-content.dto.js';

/**
 * Agency-side Content operations (Client Operations V1).
 *
 * Authorization chain (identical to the social-accounts agency controller):
 * global JwtAuthGuard -> global OrganizationMembershipGuard (verified
 * `X-Organization-Id`) -> RoleGuard + @RequireMinimumRole('ADMIN') on every
 * MUTATION -> requireClientInScope() proving an ACTIVE
 * ClientAgencyRelationship (uniform 404 otherwise).
 *
 * The AGENCY acts as 'AGENCY_ADMIN' in the authority matrix, which means it can
 * draft, submit (DRAFT -> IN_REVIEW), resubmit after changes, and archive - but
 * it can NEVER request changes, and it can NEVER grant Final Confirmation
 * (client-owner-only, decision D4). There is deliberately no agency route that
 * writes an approval.
 */
@ApiTags('content')
@ApiBearerAuth()
@Controller('clients/:clientId/content')
export class ContentController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly contentService: ContentService,
    private readonly statusService: ContentStatusService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List Content for a Client (agency scope).' })
  @ApiOkResponse({ description: 'Content rows with confirmation state.' })
  @ApiNotFoundResponse({ description: 'Client not found for this Agency.' })
  async list(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query(new ZodValidationPipe(listContentQuerySchema)) query: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.contentService.listForClient(
      clientId,
      normaliseListContentQuery(query as ListContentQueryDto),
    );
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Create a DRAFT Content item (status is never accepted).',
  })
  @ApiCreatedResponse({ description: 'The created DRAFT row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  async create(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body(new ZodValidationPipe(createContentSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.contentService.create(
      clientId,
      user.sub,
      dto as CreateContentDto,
    );
  }

  @Get(':contentId/revisions')
  @ApiOperation({ summary: 'Insert-only revision history for one item.' })
  @ApiOkResponse({ description: 'Immutable snapshots, newest first.' })
  async revisions(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.statusService.listRevisions(clientId, contentId);
  }

  @Get(':contentId/status-events')
  @ApiOperation({ summary: 'Append-only transition history for one item.' })
  @ApiOkResponse({ description: 'Status events, newest first.' })
  async statusEvents(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.statusService.listStatusEvents(clientId, contentId);
  }

  @Get(':contentId')
  @ApiOperation({ summary: 'Read one Content item within the Agency scope.' })
  @ApiOkResponse({ description: 'The Content row.' })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async get(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.contentService.findOneForClient(clientId, contentId);
  }

  @Patch(':contentId')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Edit title/body (appends a revision; D7 revert applies).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async update(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(updateContentSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.contentService.update({
      clientId,
      contentId,
      actorUserId: user.sub,
      actor: 'AGENCY_ADMIN',
      dto: dto as UpdateContentDto,
    });
  }

  @Post(':contentId/status')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Transition status (never to APPROVED - that is client-only).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN, or the actor may not perform it.',
  })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async transition(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(transitionContentSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    const body = dto as TransitionContentDto;
    return this.statusService.transition({
      clientId,
      contentId,
      actor: 'AGENCY_ADMIN',
      actorUserId: user.sub,
      to: body.to,
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