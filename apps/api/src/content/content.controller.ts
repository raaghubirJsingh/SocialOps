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
import { AIAgentService } from './ai-agent.service.js';
import { ChangeRequestService } from './change-request.service.js';
import { createContentSchema } from './dto/create-content.dto.js';
import type { CreateContentDto } from './dto/create-content.dto.js';
import { createInternalNoteSchema } from './dto/create-internal-note.dto.js';
import type { CreateInternalNoteDto } from './dto/create-internal-note.dto.js';
import { processAiTaskSchema } from './dto/process-ai-task.dto.js';
import type { ProcessAiTaskDto } from './dto/process-ai-task.dto.js';
import { InternalNoteService } from './internal-note.service.js';
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
    private readonly changeRequestService: ChangeRequestService,
    private readonly internalNoteService: InternalNoteService,
    private readonly aiAgentService: AIAgentService,
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
    return this.contentService.create({
      clientId,
      actorUserId: user.sub,
      // Server-verified managing Agency: the organization context was proven by
      // the global OrganizationMembershipGuard, never supplied by the client.
      agencyId: organization.id,
      dto: dto as CreateContentDto,
    });
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

  // ---------------------------------------------------------------------------
  // Internal Notes (Phase 2) - AGENCY ONLY, never returned to a Client
  // ---------------------------------------------------------------------------

  /**
   * Read the Agency's internal discussion thread for one Content item.
   *
   * The route lives on the AGENCY controller only: there is deliberately no
   * Client counterpart, and InternalNoteService filters by the verified
   * `agencyId` so one Agency can never read another Agency's notes. Notes for a
   * Content item the Client has moved to a different Agency remain invisible to
   * the new Agency as well.
   */
  @Get(':contentId/internal-notes')
  @ApiOperation({ summary: 'List internal notes (Agency only).' })
  @ApiOkResponse({ description: 'Internal notes, newest first.' })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async listInternalNotes(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.internalNoteService.listForContent(
      clientId,
      contentId,
      organization.id,
    );
  }

  /**
   * Write an internal note. Allows MEMBER (not just ADMIN) because an internal
   * note is non-destructive, agency-internal commentary - it never changes the
   * Client-visible artifact. AI Employees write notes this way under the
   * ordinary MEMBER role; the authorId is always the authenticated subject.
   */
  @Post(':contentId/internal-notes')
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('MEMBER')
  @ApiOperation({ summary: 'Create an internal note (Agency only).' })
  @ApiCreatedResponse({ description: 'The created InternalNote row.' })
  @ApiForbiddenResponse({ description: 'Requires MEMBER or above.' })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async createInternalNote(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(createInternalNoteSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.internalNoteService.create({
      contentId,
      clientId,
      // The Agency scoping key is the VERIFIED organization id, never input.
      agencyId: organization.id,
      // Audit trail: the authenticated user (human Manager or AI bot) is the
      // author; an authorId is never accepted from the body.
      authorId: user.sub,
      body: (dto as CreateInternalNoteDto).body,
    });
  }

  // ---------------------------------------------------------------------------
  // Change Requests (Phase 2) - raised by the Client, reviewed by the Agency
  // ---------------------------------------------------------------------------

  @Get(':contentId/change-requests')
  @ApiOperation({
    summary: 'List change requests for one item (Agency view).',
  })
  @ApiOkResponse({ description: 'Change requests, newest first.' })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async listChangeRequests(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.changeRequestService.listForContent(clientId, contentId);
  }

  // ---------------------------------------------------------------------------
  // AI Employee Fleet (Phase 2) - mocked LLM output, real audit trail
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a task to an AI Employee.
   *
   * `/ai-tasks` returns 202-style semantic ("accepted") but the work is
   * synchronous for now: the LLM call is mocked, so the row is already written
   * when the response is returned. The Agency (OWNER/ADMIN) dispatches; the AI
   * Employee must itself hold the MEMBER role of this Organization, verified
   * again inside AIAgentService (AGENTS.md §7 - `isBot` is never authority).
   */
  @Post(':contentId/ai-tasks')
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Process a mocked AI task and store it under the AI User id.',
    description:
      'Dispatches a task to a User with isBot = true that holds the MEMBER role in this Organization. The mocked output is stored as an insert-only ContentRevision or InternalNote authored by that AI User.',
  })
  @ApiCreatedResponse({ description: 'The stored revision or note.' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER/ADMIN, or the AI User is not a MEMBER.',
  })
  @ApiNotFoundResponse({ description: 'Content not found for this Client.' })
  async processAiTask(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(processAiTaskSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    const body = dto as ProcessAiTaskDto;
    return this.aiAgentService.processAiTask({
      contentId,
      clientId,
      aiUserId: body.aiUserId,
      agencyId: organization.id,
      prompt: body.prompt,
      outputType: body.outputType,
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