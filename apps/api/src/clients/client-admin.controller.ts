import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClientStatusService } from './client-status.service.js';
import { ClientDiscoveryService } from './client-discovery.service.js';
import { ClientsService } from './clients.service.js';
import { clientStatusSchema } from './dto/client-status.dto.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { SocialOpsAdminGuard } from './guards/socialops-admin.guard.js';

/**
 * SOCIALOPS_ADMIN limited operations (Client Module V1, ACT-1 Option A).
 *
 * `@Public()` bypasses only OrganizationMembershipGuard; the global
 * JwtAuthGuard still requires JWT. `SocialOpsAdminGuard` additionally
 * requires User.isSocialOpsAdmin read from the DB (the JWT carries no
 * admin claim -> no auth-behavior change). An Agency ADMIN never implies
 * SOCIALOPS_ADMIN. The surface is intentionally limited to the two
 * approved platform operations (no unrestricted admin access).
 */
@Controller('admin')
export class ClientAdminController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly statusService: ClientStatusService,
    private readonly discoveryService: ClientDiscoveryService,
  ) {}

  @Post('clients/:id/status')
  @Public()
  @UseGuards(SocialOpsAdminGuard)
  async changeStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(clientStatusSchema)) dto: unknown,
  ) {
    const body = dto as { status: never; reason?: string };
    const client = await this.clientsService.findClientById(id);
    if (!client) return [];
    return this.statusService.changeStatus(
      client,
      body.status,
      'SOCIALOPS_ADMIN',
      user.sub,
      body.reason,
    );
  }

  @Post('agencies/:id/discovery/approve')
  @Public()
  @UseGuards(SocialOpsAdminGuard)
  approveDiscovery(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) organizationId: string,
  ) {
    return this.discoveryService.approve(organizationId, user.sub);
  }
}