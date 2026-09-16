import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import {
  createRawDataSchema,
  listRawDataQuerySchema,
  normaliseListRawDataQuery,
  type CreateRawDataDto,
  type ListRawDataQueryDto,
} from './dto/raw-data.dto.js';
import { RawDataService } from './raw-data.service.js';

/**
 * Agency-side RawData intake (Client Operations V1).
 *
 * INSERT-ONLY: there is deliberately no PATCH or DELETE route here (or
 * anywhere) - intake records are immutable provenance. The hash is computed
 * server-side, and `storageRef` is never accepted (S3 remains deferred).
 */
@ApiTags('raw-data')
@ApiBearerAuth()
@Controller('clients/:clientId/raw-data')
export class RawDataController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly rawDataService: RawDataService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List raw intake records for a Client.' })
  @ApiOkResponse({ description: 'Insert-only intake records.' })
  @ApiNotFoundResponse({ description: 'Client not found for this Agency.' })
  async list(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query(new ZodValidationPipe(listRawDataQuerySchema)) query: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.rawDataService.listForClient(
      clientId,
      normaliseListRawDataQuery(query as ListRawDataQueryDto),
    );
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary: 'Record raw intake material (text/metadata only, insert-only).',
    description:
      'The integrity hash is computed server-side; contentHash and storageRef are not accepted.',
  })
  @ApiCreatedResponse({ description: 'The created immutable intake record.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  async create(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body(new ZodValidationPipe(createRawDataSchema)) dto: unknown,
  ) {
    await this.requireClientInScope(clientId, organization.id);
    return this.rawDataService.create(
      clientId,
      user.sub,
      dto as CreateRawDataDto,
    );
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