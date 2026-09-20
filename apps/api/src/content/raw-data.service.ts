import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { S3Service } from '../s3/s3.service.js';
import { RAW_DATA_SELECT } from './content.select.js';
import { rawDataHashOf } from './content-hash.js';
import type {
  CreateRawDataDto,
  ListRawDataQuery,
} from './dto/raw-data.dto.js';

/**
 * RawData intake (Client Operations V1) - INSERT-ONLY.
 *
 * The approved model is an immutable provenance record: this service exposes
 * `create`, `listForClient`, and `findOneForClient` and NOTHING else, so
 * insert-only is structural rather than a convention (no controller route
 * exists that could update or delete a RawData row).
 *
 * `contentHash` is always computed SERVER-side from the payload actually
 * received, so the integrity hash cannot be spoofed by a caller.
 *
 * `storageRef` (approved AGENTS.md §13 override) stores ONLY the internal S3
 * object key minted by the upload-url endpoints. When a caller supplies one,
 * `organizationId` MUST be provided by the controller (verified org context or
 * ACTIVE ClientAgencyRelationship) so the key is re-validated against the
 * `{organizationId}/{clientId}/raw-data/` tenant prefix - URL-shaped values
 * and cross-tenant keys are rejected outright.
 */
@Injectable()
export class RawDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  listForClient(clientId: string, filters: ListRawDataQuery) {
    return this.prisma.rawData.findMany({
      where: {
        clientId,
        ...(filters.source ? { source: filters.source } : {}),
      },
      select: RAW_DATA_SELECT,
      orderBy: { capturedAt: 'desc' },
      take: filters.take,
    });
  }

  async findOneForClient(clientId: string, rawDataId: string) {
    const record = await this.prisma.rawData.findFirst({
      where: { id: rawDataId, clientId },
      select: RAW_DATA_SELECT,
    });
    if (!record) throw new NotFoundException('Raw data not found');
    return record;
  }

  /**
   * Insert one intake record. When `contentId` is supplied it MUST belong to
   * the same Client - otherwise the request is a uniform 404, so a Client can
   * never attach raw material to another Client's Content.
   *
   * `options.organizationId` is the VERIFIED tenant context for storageRef
   * validation: the agency controller passes the JWT org id, the client
   * controller passes the ACTIVE ClientAgencyRelationship org id. When the
   * caller supplies no storageRef, org resolution is not required (text-only
   * intake keeps working for self-registered clients with no agency).
   */
  async create(
    clientId: string,
    actorUserId: string,
    dto: CreateRawDataDto,
    options: { organizationId?: string } = {},
  ) {
    if (dto.contentId) {
      const content = await this.prisma.content.findFirst({
        where: { id: dto.contentId, clientId },
        select: { id: true },
      });
      if (!content) throw new NotFoundException('Content not found');
    }

    // Tenant-prefix re-validation of the storageRef (defense-in-depth: the
    // key must have been minted by the upload-url endpoint for THIS tenant).
    if (dto.storageRef) {
      if (!options.organizationId) {
        throw new ForbiddenException(
          'Client is not actively managed by any agency',
        );
      }
      this.s3.assertValidStorageRef(
        dto.storageRef,
        options.organizationId,
        clientId,
      );
    }

    return this.prisma.rawData.create({
      data: {
        clientId,
        source: dto.source,
        contentId: dto.contentId ?? null,
        mimeType: dto.mimeType ?? null,
        originalFileName: dto.originalFileName ?? null,
        extractedText: dto.extractedText ?? null,
        metadata: (dto.metadata ?? undefined) as never,
        contentHash: rawDataHashOf(dto.extractedText, dto.metadata),
        byteSize: dto.byteSize ?? null,
        storageRef: dto.storageRef ?? null,
        capturedByUserId: actorUserId,
      },
      select: RAW_DATA_SELECT,
    });
  }
}