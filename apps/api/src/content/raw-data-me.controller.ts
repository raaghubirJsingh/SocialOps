import {
  Body,
  Controller,
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
import { Public } from '../rbac/decorators/public.decorator.js';
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
 */
@ApiTags('raw-data')
@ApiBearerAuth()
@Controller('client/me/raw-data')
export class RawDataMeController {
  constructor(private readonly rawDataService: RawDataService) {}

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

  @Post()
  @HttpCode(201)
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary: 'Record raw intake material (text/metadata only, insert-only).',
  })
  @ApiCreatedResponse({ description: 'The created immutable intake record.' })
  create(
    @CurrentClient() client: Client,
    @Body(new ZodValidationPipe(createRawDataSchema)) dto: unknown,
  ) {
    return this.rawDataService.create(
      client.id,
      client.ownerUserId as string,
      dto as CreateRawDataDto,
    );
  }
}