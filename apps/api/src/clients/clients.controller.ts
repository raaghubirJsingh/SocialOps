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
  UseGuards,
} from '@nestjs/common';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentOrganization } from '../rbac/decorators/current-organization.decorator.js';
import type { RequestOrganizationContext } from '../rbac/decorators/current-organization.decorator.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { RequireMinimumRole } from '../rbac/decorators/require-roles.decorator.js';
import { RoleGuard } from '../rbac/guards/role.guard.js';
import { ClientAgencyRelationshipService } from './client-agency-relationship.service.js';
import { ClientDiscoveryService } from './client-discovery.service.js';
import { ClientFieldChangeService } from './client-field-change.service.js';
import { ClientInvitationService } from './client-invitation.service.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientStatusService } from './client-status.service.js';
import { ClientsService } from './clients.service.js';
import { inviteClientSchema } from './dto/client-common.dto.js';
import { updateClientFieldSchema } from './dto/update-client-field.dto.js';
import { clientStatusSchema } from './dto/client-status.dto.js';
import { createClientSchema } from './dto/create-client.dto.js';

/**
 * Agency-side Client operations (Client Module V1).
 *
 * Authorization: the GLOBAL OrganizationMembershipGuard supplies the
 * verified `X-Organization-Id` context; management operations additionally
 * require OWNER or ADMIN via RoleGuard + @RequireMinimumRole('ADMIN')
 * (locked D1 matrix: MEMBER/VIEWER are denied management authority).
 * Client visibility is scoped to the ACTIVE Agency relationship.
 */
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly onboardingService: ClientOnboardingService,
    private readonly fieldChangeService: ClientFieldChangeService,
    private readonly statusService: ClientStatusService,
    private readonly relationshipService: ClientAgencyRelationshipService,
    private readonly discoveryService: ClientDiscoveryService,
    private readonly invitationService: ClientInvitationService,
  ) {}

  @Get()
  list(@CurrentOrganization() organization: RequestOrganizationContext) {
    return this.clientsService.listClientsForOrganization(organization.id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  async create(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Body(new ZodValidationPipe(createClientSchema)) dto: unknown,
  ) {
    // Agency-created Client: PENDING, UNBOUND — the creator NEVER becomes
    // the owner. The creating Organization becomes the ACTIVE Agency.
    const client = await this.clientsService.createClientForOrganization(
      dto as never,
      user.sub,
      organization.id,
    );
    return { client, invitationHint: 'POST /api/clients/:id/invite' };
  }

  @Get('agency-requests')
  listAgencyRequests(
    @CurrentOrganization() organization: RequestOrganizationContext,
  ) {
    return this.relationshipService.listPendingRequestsForOrganization(
      organization.id,
    );
  }

  @Post('agency-requests/:id/accept')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  acceptAgencyRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipService.acceptClientRequestByAgency(
      relationshipId,
      organization.id,
      user.sub,
    );
  }

  @Post('agency-requests/:id/reject')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  rejectAgencyRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipService.rejectPending(
      relationshipId,
      { organizationId: organization.id },
      user.sub,
    );
  }

  @Get(':id')
  async get(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const client = await this.clientsService.getClientForOrganization(
      id,
      organization.id,
    );
    if (!client) throwClientNotFound();
    return client;
  }

  @Patch(':id')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  async updateField(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClientFieldSchema)) dto: unknown,
  ) {
    const body = dto as { field: never; value: never; currentPassword?: string };
    const client = await this.clientsService.getClientForOrganization(
      id,
      organization.id,
    );
    if (!client) throwClientNotFound();
    this.onboardingService.assertOperationallyActive(client);
    return this.fieldChangeService.requestFieldChange({
      client,
      field: body.field,
      value: body.value,
      actorUserId: user.sub,
      source: 'AGENCY',
      currentPassword: body.currentPassword,
    });
  }

  @Get(':id/history')
  async history(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const events = await this.clientsService.getHistoryForOrganization(
      id,
      organization.id,
    );
    if (events === null) throwClientNotFound();
    return events;
  }
}

/** Uniform 404 for any Client outside the acting Agency's ACTIVE scope. */
function throwClientNotFound(): never {
  throw new NotFoundException('Client not found');
}

// Management routes below the :id routes for readability; Nest resolves
// literal segments (agency-requests) before :id regardless of position
// because they are declared earlier in this controller.

@Controller('clients')
export class ClientsManagementController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly statusService: ClientStatusService,
    private readonly relationshipService: ClientAgencyRelationshipService,
    private readonly invitationService: ClientInvitationService,
  ) {}

  @Post(':id/status')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  async changeStatus(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(clientStatusSchema)) dto: unknown,
  ) {
    const body = dto as { status: never; reason?: string };
    const client = await this.clientsService.getClientForOrganization(
      id,
      organization.id,
    );
    if (!client) throwClientNotFound();
    return this.statusService.changeStatus(
      client,
      body.status,
      'AGENCY',
      user.sub,
      body.reason,
    );
  }

  @Post(':id/invite')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  async invite(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inviteClientSchema)) dto: unknown,
  ) {
    const client = await this.clientsService.getClientForOrganization(
      id,
      organization.id,
    );
    if (!client) throwClientNotFound();
    return this.invitationService.issueInvitation(
      client,
      (dto as { email: string }).email,
      user.sub,
    );
  }

  @Post(':id/management-requests')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  createManagementRequest(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) clientId: string,
  ) {
    // Agency -> Client invitation/request: the Client must accept.
    return this.relationshipService.createAgencyRequest(
      clientId,
      organization.id,
      user.sub,
    );
  }

  @Post(':id/agency-relationship/terminate')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  terminate(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('id', ParseUUIDPipe) clientId: string,
  ) {
    // Explicit termination first; no silent replacement. Removes Agency
    // access; Client and ownerUserId remain intact.
    return this.relationshipService.terminateForAgency(
      clientId,
      organization.id,
      user.sub,
    );
  }
}

/**
 * Agency discovery opt-in (Agency-side, org-scoped OWNER/ADMIN).
 * Discoverability additionally requires SOCIALOPS_ADMIN approval.
 */
@Controller('organizations')
export class AgencyDiscoveryController {
  constructor(private readonly discoveryService: ClientDiscoveryService) {}

  @Post('discovery/opt-in')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  optIn(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
  ) {
    void user;
    return this.discoveryService.optIn(organization.id);
  }
}