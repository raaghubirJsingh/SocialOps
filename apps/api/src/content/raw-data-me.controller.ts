import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../rbac/decorators/public.decorator.js';
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
 * Client-side RawData intake (Client Operations V1).
 *
 * INSERT-ONLY and tenant-scoped through `@CurrentClient()`: the client id is
 * never accepted as input. An optional `contentId` must belong to the same
 * Client (enforced in the service with a uniform 404).
 *
 * Upload flow (approved AGENTS.md §13 override, zero-buffer): the Client
 * mints a short-lived presigned PUT URL (`POST client/me/raw-data/upload-url`)
 * and the browser uploads DIRECTLY to the private bucket. The S3 object key is
 * strictly prefixed `{organizationId}/{clientId}/raw-data/` where the
 * organizationId is resolved SERVER-side from the ACTIVE
 * ClientAgencyRelationship - a Client is never a member of the Organization,
 * and an unmanaged Client cannot upload (uniform 403, no org leakage).
 */
@ApiTags('raw-data')
@ApiBearerAuth()
@Controller('client/me/raw-data')
export class RawDataMeController {
  constructor(
    private readonly rawDataService: RawDataService,
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolve the ACTIVE managing organization for the bound Client.
   *
   * A self-registered Client is NOT an Organization member, so the tenant
   * prefix cannot come from the JWT - it comes from the ACTIVE
   * ClientAgencyRelationship. No ACTIVE relationship => uniform 403.
   */
  private async requireActiveManagingOrganization(
    client: Client,
  ): Promise<string> {
    const relationship = await this.prisma.clientAgencyRelationship.findFirst({
      where: {
        clientId: client.id,
        status: 'ACTIVE', // Ensure they are actively managed
      },
      select: { organizationId: true },
    });

    if (!relationship) {
      throw new ForbiddenException(
        'Client is not actively managed by any agency.',
      );
    }
    return relationship.organizationId;
  }

  @Get()
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'List my own raw intake records.' })
  @ApiOkResponse({ description: 'Insert-only intake records.' })
  @ApiForbiddenResponse({ description: 'No Client binding for this user.' })
  list(
    @CurrentClient() client: Client,
    @Query(new ZodValidationPipe(listRawDataQuerySchema)) query: unknown,
  ) {
    return this.rawDataService.listForClient(
      client.id,
      normaliseListRawDataQuery(query as ListRawDataQueryDto),
    );
  }

  @Get(':rawDataId')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: 'Read one of my own raw intake records.' })
  @ApiOkResponse({ description: 'The immutable intake record.' })
  @ApiNotFoundResponse({ description: 'Not found for this Client.' })
  get(
    @CurrentClient() client: Client,
    @Param('rawDataId', ParseUUIDPipe) rawDataId: string,
  ) {
    return this.rawDataService.findOneForClient(client.id, rawDataId);
  }

  @Post('upload-url')
  @HttpCode(200)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary:
      'Mint a short-lived presigned PUT URL for my own raw-data media (zero-buffer).',
    description:
      'Requires an ACTIVE managing agency. Returns { uploadUrl, objectKey, expiresIn }; the browser uploads directly to the private bucket. The object key is strictly prefixed {organizationId}/{clientId}/raw-data/ with the organization resolved server-side from the ACTIVE ClientAgencyRelationship.',
  })
  @ApiOkResponse({ description: 'Presigned PUT URL and internal object key.' })
  @ApiForbiddenResponse({
    description: 'No Client binding, or no ACTIVE managing agency.',
  })
  async createUploadUrl(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(presignedUploadSchema)) dto: unknown,
  ) {
    const organizationId = await this.requireActiveManagingOrganization(client);
    const body = dto as PresignedUploadDto;
    const objectKey = this.s3Service.buildObjectKey(
      organizationId,
      client.id,
      body.contentType,
    );
    return this.s3Service.createPresignedPutUrl(
      objectKey,
      body.contentType,
      body.contentLength,
    );
  }

  @Post()
  @HttpCode(201)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary:
      'Record raw intake material (text/metadata and/or an uploaded object, insert-only).',
  })
  @ApiCreatedResponse({ description: 'The created immutable intake record.' })
  @ApiForbiddenResponse({ description: 'No Client binding for this user.' })
  async create(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(createRawDataSchema)) dto: unknown,
  ) {
    const body = dto as CreateRawDataDto;
    // Org resolution is required ONLY when a storageRef is attached; plain
    // text intake keeps working for self-registered clients with no agency.
    const organizationId = body.storageRef
      ? await this.requireActiveManagingOrganization(client)
      : undefined;

    return this.rawDataService.create(
      client.id,
      client.ownerUserId as string,
      body,
      organizationId ? { organizationId } : {},
    );
  }
}