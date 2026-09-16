import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
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
 * received, so the integrity hash cannot be spoofed by a caller. `storageRef`
 * is never written here: S3-compatible storage remains deferred (AGENTS.md
 * section 13), so V1 stores extracted text and/or structured metadata only.
 */
@Injectable()
export class RawDataService {
  constructor(private readonly prisma: PrismaService) {}

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
   */
  async create(
    clientId: string,
    actorUserId: string,
    dto: CreateRawDataDto,
  ) {
    if (dto.contentId) {
      const content = await this.prisma.content.findFirst({
        where: { id: dto.contentId, clientId },
        select: { id: true },
      });
      if (!content) throw new NotFoundException('Content not found');
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
        capturedByUserId: actorUserId,
      },
      select: RAW_DATA_SELECT,
    });
  }
}