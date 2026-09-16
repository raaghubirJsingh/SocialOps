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
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { ContentStatusService } from './content-status.service.js';
import { ContentService } from './content.service.js';
import { confirmFinalContentSchema } from './dto/confirm-final.dto.js';
import type { ConfirmFinalContentDto } from './dto/confirm-final.dto.js';
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
export class ContentMeController {
  constructor(
    private readonly contentService: ContentService,
    private readonly statusService: ContentStatusService,
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
    return this.contentService.listForClient(
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
  create(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(createContentSchema)) dto: unknown,
  ) {
    return this.contentService.create(
      client.id,
      client.ownerUserId as string,
      dto as CreateContentDto,
    );
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

  @Get(':contentId/status-events')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Append-only transition history for one item.' })
  @ApiOkResponse({ description: 'Status events, newest first.' })
  statusEvents(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    return this.statusService.listStatusEvents(client.id, contentId);
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
    return this.contentService.findOneForClient(client.id, contentId);
  }

  @Patch(':contentId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Edit title/body (appends a revision; D7 revert applies).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  update(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(updateContentSchema)) dto: unknown,
  ) {
    return this.contentService.update({
      clientId: client.id,
      contentId,
      actorUserId: client.ownerUserId as string,
      actor: 'CLIENT_OWNER',
      dto: dto as UpdateContentDto,
    });
  }

  @Post(':contentId/status')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Transition status (never to APPROVED - use final-confirmation).',
  })
  @ApiOkResponse({ description: 'The updated Content row.' })
  @ApiForbiddenResponse({ description: 'This actor may not perform it.' })
  transition(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(transitionContentSchema)) dto: unknown,
  ) {
    const body = dto as TransitionContentDto;
    return this.statusService.transition({
      clientId: client.id,
      contentId,
      actor: 'CLIENT_OWNER',
      actorUserId: client.ownerUserId as string,
      to: body.to,
      note: body.note,
    });
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
  confirmFinal(
    @CurrentClient() client: Client,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(confirmFinalContentSchema)) dto: unknown,
  ) {
    return this.statusService.confirmFinal({
      clientId: client.id,
      contentId,
      actorUserId: client.ownerUserId as string,
      note: (dto as ConfirmFinalContentDto).note,
    });
  }
}