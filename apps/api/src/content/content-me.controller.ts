import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Client } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentClient } from '../clients/decorators/current-client.decorator.js';
import { ClientAccessGuard } from '../clients/guards/client-access.guard.js';
import { OperationalGatingService } from '../common/operational-gating.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { ChangeRequestService } from './change-request.service.js';
import { ClientBoundaryInterceptor } from './client-boundary.interceptor.js';
import { ContentStatusService } from './content-status.service.js';
import { ContentService } from './content.service.js';
import { confirmFinalContentSchema } from './dto/confirm-final.dto.js';
import type { ConfirmFinalContentDto } from './dto/confirm-final.dto.js';
import { createChangeRequestSchema } from './dto/create-change-request.dto.js';
import type { CreateChangeRequestDto } from './dto/create-change-request.dto.js';
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
 * Client-side Content self-service (Client Operations V1).
 *
 * `@Public()` bypasses ONLY the organization-context requirement (a Client
 * owner is not an Organization member); the global JwtAuthGuard still requires
 * a valid token, and ClientAccessGuard re-verifies the User -> Client binding
 * (and onboarding ACTIVE) on every request. `clientId` always comes from
 * `@CurrentClient()`, never from input.
 *
 * The CLIENT acts as 'CLIENT_OWNER': it may submit, review (request changes),
 * archive, edit, and - uniquely - grant FINAL CONFIRMATION through the
 * dedicated endpoint below. That endpoint is the only door to APPROVED.
 */
@ApiTags('content')
@ApiBearerAuth()
@Controller('client/me/content')
@UseInterceptors(ClientBoundaryInterceptor)
export class ContentMeController {
  constructor(
    private readonly contentService: ContentService,
    private readonly statusService: ContentStatusService,
    private readonly changeRequestService: ChangeRequestService,
    private readonly gating: OperationalGatingService,
  ) {}

  @Get()
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'List my own Content.' })
  @ApiOkResponse({ description: 'Content rows with confirmation state.' })
  @ApiForbiddenResponse({ description: 'No Client binding for this user.' })
  list(
    @CurrentClient() client: Client,
    @Query(new ZodValidationPipe(listContentQuerySchema)) query: unknown,
  ) {
    // Client-safe projection: agencyId and internalNotes never leave the API
    // boundary (Phase 2 strict data boundary).
    return this.contentService.listForOwningClient(
      client.id,
      normaliseListContentQuery(query as ListContentQueryDto),
    );
  }

  @Post()
  @HttpCode(201)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Create a DRAFT Content item (status accepted: no).' })
  @ApiCreatedResponse({ description: 'The created DRAFT row.' })
  async create(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(createContentSchema)) dto: unknown,
  ) {
    // ClientAccessGuard already proved binding + onboarding ACTIVE; the
    // SocialAccount dependency applies here too (creation only).
    await this.gating.requireActiveSocialAccount(client.id);
    // No agencyId argument: a Client has no organization context, so the
    // service resolves the managing Agency from the ACTIVE relationship.
    const content = await this.contentService.create({
      clientId: client.id,
      actorUserId: client.ownerUserId as string,
      dto: dto as CreateContentDto,
    });
    return this.contentService.findOneForOwningClient(client.id, content.id);
  }

  @Get(':contentId/revisions')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Insert-only revision history for one item.' })
  @ApiOkResponse({ description: 'Immutable snapshots, newest first.' })
  revisions(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    return this.statusService.listRevisions(client.id, contentId);
  }

  @Get(':contentId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Read one of my own Content items.' })
  @ApiOkResponse({ description: 'The Content row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  get(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    // Client-safe projection: no agencyId, no internalNotes.
    return this.contentService.findOneForOwningClient(client.id, contentId);
  }

  @Patch(':contentId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Edit title/body (appends a revision; D7 revert applies).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  async update(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(updateContentSchema)) dto: unknown,
  ) {
    await this.contentService.update({
      clientId: client.id,
      contentId,
      actorUserId: client.ownerUserId as string,
      actor: 'CLIENT_OWNER',
      dto: dto as UpdateContentDto,
    });
    return this.contentService.findOneForOwningClient(client.id, contentId);
  }

  @Post(':contentId/status')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Transition status (never to APPROVED - use final-confirmation).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiForbiddenResponse({ description: 'This actor may not perform it.' })
  async transition(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(transitionContentSchema)) dto: unknown,
  ) {
    const body = dto as TransitionContentDto;
    await this.statusService.transition({
      clientId: client.id,
      contentId,
      actor: 'CLIENT_OWNER',
      actorUserId: client.ownerUserId as string,
      to: body.to,
      note: body.note,
    });
    return this.contentService.findOneForOwningClient(client.id, contentId);
  }

  /**
   * FINAL CONFIRMATION - the ONLY door to APPROVED (client owner only, D4).
   *
   * Writes the confirmation triple atomically with an immutable revision and an
   * audit event. Publishing (still deferred) must verify this triple plus the
   * revision hash before anything is posted.
   */
  @Post(':contentId/final-confirmation')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Grant Final Confirmation (moves IN_REVIEW to APPROVED).',
    description:
      'The only route that can set APPROVED. Writes finalConfirmedAt, finalConfirmedByUserId and finalConfirmedRevisionId in one transaction together with the immutable revision snapshot.',
  })
  @ApiOkResponse({ description: 'The APPROVED Content row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  async confirmFinal(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(confirmFinalContentSchema)) dto: unknown,
  ) {
    await this.statusService.confirmFinal({
      clientId: client.id,
      contentId,
      actorUserId: client.ownerUserId as string,
      note: (dto as ConfirmFinalContentDto).note,
    });
    return this.contentService.findOneForOwningClient(client.id, contentId);
  }

  // ---------------------------------------------------------------------------
  // Final Confirmed Lock (Phase 2) - the Client owner's lock, UNDER_CLIENT_REVIEW
  // -> FINAL_CONFIRMED. Reachable ONLY here, exactly like APPROVED is reachable
  // only through final-confirmation above.
  // ---------------------------------------------------------------------------

  /**
   * Lock the item at FINAL_CONFIRMED.
   *
   * After this call the content is strictly immutable: no edits, no further
   * revisions, and no new change requests. The status machine allows only
   * ARCHIVED from here, and the frozen revision hash written in the same
   * transaction is what a future Publishing step must verify.
   */
  @Post(':contentId/final-confirmed-lock')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Lock content at FINAL_CONFIRMED (immutable afterwards).',
    description:
      'The Client owner finalises the UNDER_CLIENT_REVIEW item. Writes the immutable revision snapshot and the confirmation triple atomically; the item refuses every later edit, revision and change request.',
  })
  @ApiOkResponse({ description: 'The FINAL_CONFIRMED Content row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  async confirmFinalLocked(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(confirmFinalContentSchema)) dto: unknown,
  ) {
    await this.statusService.confirmFinalLocked({
      clientId: client.id,
      contentId,
      actorUserId: client.ownerUserId as string,
      note: (dto as ConfirmFinalContentDto).note,
    });
    return this.contentService.findOneForOwningClient(client.id, contentId);
  }

  // ---------------------------------------------------------------------------
  // Change Requests (Phase 2)
  // ---------------------------------------------------------------------------

  @Post(':contentId/change-requests')
  @HttpCode(201)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Create a change request for a Content item.',
    description:
      'The Client owner submits a change request. SCENARIO_1 content is limited to a maximum of 2 change requests (enforced server-side).',
  })
  @ApiCreatedResponse({ description: 'The created ChangeRequest row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  createChangeRequest(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(createChangeRequestSchema)) dto: unknown,
  ) {
    const body = dto as CreateChangeRequestDto;
    return this.changeRequestService.create({
      contentId,
      clientId: client.id,
      requestedById: client.ownerUserId as string,
      requestDetails: body.requestDetails,
    });
  }

  @Get(':contentId/change-requests')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'List change requests for a Content item.' })
  @ApiOkResponse({ description: 'Change requests, newest first.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  listChangeRequests(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    return this.changeRequestService.listForContent(client.id, contentId);
  }
}