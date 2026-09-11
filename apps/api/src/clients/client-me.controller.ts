import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Client } from '@prisma/client';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentClient } from './decorators/current-client.decorator.js';
import { ClientAccessGuard } from './guards/client-access.guard.js';
import { ClientAgencyRelationshipService } from './client-agency-relationship.service.js';
import { ClientDiscoveryService } from './client-discovery.service.js';
import { ClientFieldChangeService } from './client-field-change.service.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientsService } from './clients.service.js';
import { agencyRequestSchema, verifyTokenSchema } from './dto/client-common.dto.js';
import { updateClientFieldSchema } from './dto/update-client-field.dto.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';

/**
 * Client-side self-service (Client Module V1).
 *
 * `@Public()` bypasses ONLY the global OrganizationMembershipGuard (client
 * users are not Organization members); the global JwtAuthGuard still
 * requires a valid JWT. Every operational route additionally runs
 * `ClientAccessGuard`: direct User -> Client binding (via the `X-Client-Id`
 * header, always verified against the binding — never trusted as an
 * authorization source) AND onboardingStatus = ACTIVE.
 *
 * There is deliberately NO route through which a Client can change its own
 * operational status (locked D1); the explicit /status route always denies.
 */
@Controller('client')
export class ClientMeController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly onboardingService: ClientOnboardingService,
    private readonly fieldChangeService: ClientFieldChangeService,
    private readonly relationshipService: ClientAgencyRelationshipService,
    private readonly discoveryService: ClientDiscoveryService,
  ) {}

  @Get('me')
  @Public()
  @UseGuards(ClientAccessGuard)
  me(@CurrentClient() client: Client) {
    return client;
  }

  @Get('me/history')
  @Public()
  @UseGuards(ClientAccessGuard)
  history(@CurrentClient() client: Client) {
    return this.clientsService.getHistoryForOwner(client.id);
  }

  @Get('me/agency-relationships')
  @Public()
  @UseGuards(ClientAccessGuard)
  relationships(@CurrentClient() client: Client) {
    return this.relationshipService.listRelationshipsForClient(client.id);
  }

  @Get('me/management-requests')
  @Public()
  @UseGuards(ClientAccessGuard)
  managementRequests(@CurrentClient() client: Client) {
    return this.relationshipService.listPendingInvitationsForClient(client.id);
  }

  @Get('agencies/discover')
  @Public()
  @UseGuards(ClientAccessGuard)
  discoverAgencies() {
    return this.discoveryService.listDiscoverableAgencies();
  }

  @Patch('me')
  @Public()
  @UseGuards(ClientAccessGuard)
  updateField(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(updateClientFieldSchema)) dto: unknown,
  ) {
    const body = dto as { field: never; value: never; currentPassword?: string };
    this.onboardingService.assertOperationallyActive(client);
    return this.fieldChangeService.requestFieldChange({
      client,
      field: body.field,
      value: body.value,
      actorUserId: user.sub,
      source: 'CLIENT',
      currentPassword: body.currentPassword,
    });
  }

  @Post('me/field-changes/:id/verify')
  @Public()
  @UseGuards(ClientAccessGuard)
  verifyFieldChange(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Param('id') changeId: string,
    @Body(new ZodValidationPipe(verifyTokenSchema)) dto: unknown,
  ) {
    return this.fieldChangeService.verifyFieldChange(
      client,
      changeId,
      (dto as { token: string }).token,
      user.sub,
    );
  }

  @Post('me/agency-requests')
  @Public()
  @UseGuards(ClientAccessGuard)
  async createAgencyRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(agencyRequestSchema)) dto: unknown,
  ) {
    const body = dto as { organizationId: string };
    this.onboardingService.assertOperationallyActive(client);
    // The requested Agency MUST be discoverable (opt-in AND approval).
    await this.discoveryService.assertDiscoverable(body.organizationId);
    return this.relationshipService.createClientRequest(
      client,
      body.organizationId,
      user.sub,
    );
  }

  @Post('me/agency-requests/:id/reject')
  @Public()
  @UseGuards(ClientAccessGuard)
  rejectAgencyRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Param('id', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipService.rejectPending(
      relationshipId,
      { clientId: client.id },
      user.sub,
    );
  }

  @Post('me/management-requests/:id/accept')
  @Public()
  @UseGuards(ClientAccessGuard)
  async acceptManagementRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Param('id', ParseUUIDPipe) relationshipId: string,
  ) {
    this.onboardingService.assertOperationallyActive(client);
    return this.relationshipService.acceptAgencyRequestByClient(
      relationshipId,
      client.id,
      user.sub,
    );
  }

  @Post('me/management-requests/:id/reject')
  @Public()
  @UseGuards(ClientAccessGuard)
  rejectManagementRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
    @Param('id', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipService.rejectPending(
      relationshipId,
      { clientId: client.id },
      user.sub,
    );
  }

  @Post('me/agency-relationship/terminate')
  @Public()
  @UseGuards(ClientAccessGuard)
  terminate(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentClient() client: Client,
  ) {
    return this.relationshipService.terminateForClient(client.id, user.sub);
  }

  /**
   * Explicit deny (locked D1): a Client can NEVER change its own
   * operational status. Kept as a route so the denial is explicit 403.
   */
  @Post('me/status')
  @Public()
  @UseGuards(ClientAccessGuard)
  selfStatusChange(): never {
    throw new ForbiddenException('Clients cannot change their own status');
  }
}