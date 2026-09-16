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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentClient } from '../clients/decorators/current-client.decorator.js';
import { ClientAccessGuard } from '../clients/guards/client-access.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { createSocialAccountSchema } from './dto/create-social-account.dto.js';
import type { CreateSocialAccountDto } from './dto/create-social-account.dto.js';
import {
  listSocialAccountsQuerySchema,
  normaliseListSocialAccountsQuery,
  type ListSocialAccountsQueryDto,
} from './dto/list-social-accounts.dto.js';
import { updateSocialAccountSchema } from './dto/update-social-account.dto.js';
import type { UpdateSocialAccountDto } from './dto/update-social-account.dto.js';
import { SocialAccountsService } from './social-accounts.service.js';

/**
 * Client-side Social Account self-service (Client Operations V1).
 *
 * `@Public()` bypasses ONLY the global OrganizationMembershipGuard (a Client
 * owner is not an Organization member); the global JwtAuthGuard still requires
 * a valid access token. `ClientAccessGuard` then re-verifies, on EVERY
 * request, the direct User -> Client binding from `X-Client-Id` AND that
 * onboardingStatus is ACTIVE.
 *
 * `clientId` always comes from the guard-verified `@CurrentClient()` - it is
 * never accepted as input, so a Client cannot address another Client's data.
 * Metadata-only: no credential field and no OAuth route exists here.
 */
@ApiTags('social-accounts')
@ApiBearerAuth()
@Controller('client/me/social-accounts')
export class SocialAccountMeController {
  constructor(private readonly socialAccountsService: SocialAccountsService) {}

  @Get()
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'List my own social accounts.' })
  @ApiOkResponse({ description: 'Non-secret social-account metadata only.' })
  @ApiForbiddenResponse({ description: 'No Client binding for this user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  list(
    @CurrentClient() client: Client,
    @Query(new ZodValidationPipe(listSocialAccountsQuerySchema)) query: unknown,
  ) {
    return this.socialAccountsService.listForClient(
      client.id,
      normaliseListSocialAccountsQuery(query as ListSocialAccountsQueryDto),
    );
  }

  @Post()
  @HttpCode(201)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Record one of my own social accounts (metadata only).',
    description:
      'Accepts no credential of any kind - no access token, refresh token, password, OAuth code/state, or scope.',
  })
  @ApiCreatedResponse({ description: 'The created non-secret metadata row.' })
  @ApiForbiddenResponse({ description: 'No Client binding for this user.' })
  create(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(createSocialAccountSchema)) dto: unknown,
  ) {
    return this.socialAccountsService.create(
      client.id,
      client.ownerUserId as string,
      dto as CreateSocialAccountDto,
    );
  }

  @Get(':socialAccountId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Read one of my own social accounts.' })
  @ApiOkResponse({ description: 'Non-secret social-account metadata only.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  get(
    @CurrentClient() client: Client,
    @Param('socialAccountId', ParseUUIDPipe) socialAccountId: string,
  ) {
    return this.socialAccountsService.findOneForClient(client.id, socialAccountId);
  }

  @Patch(':socialAccountId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Update one of my own social accounts (platform is immutable).',
  })
  @ApiOkResponse({ description: 'The updated non-secret metadata row.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  update(
    @CurrentClient() client: Client,
    @Param('socialAccountId', ParseUUIDPipe) socialAccountId: string,
    @Body(new ZodValidationPipe(updateSocialAccountSchema)) dto: unknown,
  ) {
    return this.socialAccountsService.update(
      client.id,
      socialAccountId,
      dto as UpdateSocialAccountDto,
    );
  }
}