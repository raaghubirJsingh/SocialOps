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
  ApiUnauthorizedResponse,
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
 * Agency-side Social Account operations (Client Operations V1), metadata only.
 *
 * Authorization chain:
 *   1. global JwtAuthGuard                -> authenticated user;
 *   2. global OrganizationMembershipGuard -> verified `X-Organization-Id`
 *      (this controller does NOT use @Public(), so the header is required);
 *   3. RoleGuard + @RequireMinimumRole('ADMIN') on every MUTATION (reads are
 *      open to any member role, matching the ClientsController split);
 *   4. requireClientInScope() -> the Client is visible ONLY while the acting
 *      Organization holds an ACTIVE ClientAgencyRelationship; anything else is
 *      a uniform 404 with no existence leak.
 *
 * Deliberately absent: any OAuth connect/authorize/callback/refresh/revoke
 * route, and any credential field (docs/APPROVED_DECISIONS.md Decision 008).
 */
@ApiTags('social-accounts')
@ApiBearerAuth()
@Controller('clients/:clientId/social-accounts')
export class SocialAccountsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly socialAccountsService: SocialAccountsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List the social accounts recorded for a Client (agency scope).',
  })
  @ApiOkResponse({ description: 'Non-secret social-account metadata only.' })
  @ApiForbiddenResponse({ description: 'Not an organization member.' })
  @ApiNotFoundResponse({ description: 'Client not found for this Agency.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async list(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query(new ZodValidationPipe(listSocialAccountsQuerySchema)) query: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.socialAccountsService.listForClient(
      clientId,
      normaliseListSocialAccountsQuery(query as ListSocialAccountsQueryDto),
    );
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Record a social account for a Client (metadata only).',
    description:
      'Accepts no credential of any kind: no access token, refresh token, password, OAuth code/state, or scope. An unexpected key is rejected with 400.',
  })
  @ApiCreatedResponse({ description: 'The created non-secret metadata row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  @ApiNotFoundResponse({ description: 'Client not found for this Agency.' })
  async create(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body(new ZodValidationPipe(createSocialAccountSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.socialAccountsService.create(
      clientId,
      user.sub,
      dto as CreateSocialAccountDto,
    );
  }

  @Get(':socialAccountId')
  @ApiOperation({ summary: 'Read one social account within the Agency scope.' })
  @ApiOkResponse({ description: 'Non-secret social-account metadata only.' })
  @ApiNotFoundResponse({
    description: 'Social account not found for this Client.',
  })
  async get(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('socialAccountId', ParseUUIDPipe) socialAccountId: string,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.socialAccountsService.findOneForClient(
      clientId,
      socialAccountId,
    );
  }

  @Patch(':socialAccountId')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Update social-account metadata (platform is immutable).',
  })
  @ApiOkResponse({ description: 'The updated non-secret metadata row.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  @ApiNotFoundResponse({
    description: 'Social account not found for this Client.',
  })
  async update(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('socialAccountId', ParseUUIDPipe) socialAccountId: string,
    @Body(new ZodValidationPipe(updateSocialAccountSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.socialAccountsService.update(
      clientId,
      socialAccountId,
      dto as UpdateSocialAccountDto,
    );
  }

  /**
   * Agency-side Client scope proof. Mirrors ClientsController exactly: an
   * unknown Client and an out-of-scope one are indistinguishable (uniform
   * 404), and the ACTIVE relationship is re-checked on every request.
   */
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