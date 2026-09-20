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
import { S3Service } from '../s3/s3.service.js';
import {
  presignedUploadSchema,
  type PresignedUploadDto,
} from '../s3/dto/presigned-upload.dto.js';
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
 * server-side.
 *
 * Upload flow (approved AGENTS.md §13 override, zero-buffer): the Agency
 * mints a short-lived presigned PUT URL (`POST .../upload-url`), the browser
 * uploads DIRECTLY to the private bucket, and the returned internal object
 * key is then attached as `storageRef` on intake creation. File bytes never
 * pass through this API.
 */
@ApiTags('raw-data')
@ApiBearerAuth()
@Controller('clients/:clientId/raw-data')
export class RawDataController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly rawDataService: RawDataService,
    private readonly s3Service: S3Service,
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

  @Post('upload-url')
  @HttpCode(200)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary:
      'Mint a short-lived presigned PUT URL for raw-data media (zero-buffer).',
    description:
      'Returns { uploadUrl, objectKey, expiresIn }. The browser uploads directly to the private bucket; file bytes never pass through the API. The object key is strictly prefixed {organizationId}/{clientId}/raw-data/ from verified context - never from request input.',
  })
  @ApiOkResponse({ description: 'Presigned PUT URL and internal object key.' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN.' })
  @ApiNotFoundResponse({ description: 'Client not found for this Agency.' })
  async createUploadUrl(
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body(new ZodValidationPipe(presignedUploadSchema)) dto: unknown,
  ) {
    // Prove the ACTIVE ClientAgencyRelationship (uniform 404 otherwise).
    await this.requireClientInScope(clientId, organization.id);
    const body = dto as PresignedUploadDto;
    const objectKey = this.s3Service.buildObjectKey(
      organization.id,
      clientId,
      body.contentType,
    );
    return this.s3Service.createPresignedPutUrl(objectKey, body.contentType);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary:
      'Record raw intake material (text/metadata and/or an uploaded object, insert-only).',
    description:
      'The integrity hash is computed server-side; contentHash is not accepted. storageRef, when present, must be the internal object key minted by the upload-url endpoint for this tenant - URL-shaped values are rejected.',
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
      // VERIFIED org context for storageRef tenant-prefix validation.
      { organizationId: organization.id },
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