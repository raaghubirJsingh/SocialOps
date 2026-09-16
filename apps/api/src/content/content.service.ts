import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { CONTENT_SELECT } from './content.select.js';
import { contentHashOf } from './content-hash.js';
import type { CreateContentDto } from './dto/create-content.dto.js';
import type { ListContentQuery } from './dto/list-content.dto.js';
import type { UpdateContentDto } from './dto/update-content.dto.js';

/**
 * Content CRUD + the edit-after-approval rule (Client Operations V1).
 *
 * Status changes are owned by ContentStatusService; this service owns the
 * text, the immutable revision trail, and the approved rule D7:
 *
 *   Editing an APPROVED item appends a NEW revision, returns the item to
 *   DRAFT, and CLEARS the confirmation triple in the SAME transaction (with an
 *   APPROVED -> DRAFT audit event). A final confirmation can therefore never be
 *   silently reused after the text changes, and it is never silently invalidated
 *   either - the trail says exactly what happened.
 *
 * Defaults applied here: an edit while IN_REVIEW is rejected (D4), an edit of
 * ARCHIVED content is rejected, and `expectedRevision` gives optional
 * optimistic concurrency (D5).
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  listForClient(clientId: string, filters: ListContentQuery) {
    return this.prisma.content.findMany({
      where: {
        clientId,
        ...(filters.status ? { status: filters.status } : {}),
      },
      select: CONTENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: filters.take,
    });
  }

  /** Tenant-scoped single read: a miss is a uniform 404. */
  async findOneForClient(clientId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: CONTENT_SELECT,
    });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }

  /**
   * Create a DRAFT with its initial immutable revision. `status` is never taken
   * from the request, so nothing can be born APPROVED.
   */
  async create(
    clientId: string,
    actorUserId: string,
    dto: CreateContentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const content = await tx.content.create({
        data: {
          clientId,
          title: dto.title,
          body: dto.body,
          status: ContentStatus.DRAFT,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        select: CONTENT_SELECT,
      });

      await tx.contentRevision.create({
        data: {
          contentId: content.id,
          clientId,
          revision: 1,
          title: dto.title,
          body: dto.body,
          contentHash: contentHashOf(dto.title, dto.body),
          createdByUserId: actorUserId,
        },
      });

      return content;
    });
  }

  /** Edit title/body, appending a revision and applying rules D4/D5/D7. */
  async update(params: {
    clientId: string;
    contentId: string;
    actorUserId: string;
    actor: 'CLIENT_OWNER' | 'AGENCY_ADMIN';
    dto: UpdateContentDto;
  }) {
    const { clientId, contentId, actorUserId, actor, dto } = params;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.content.findFirst({
        where: { id: contentId, clientId },
      });
      if (!current) throw new NotFoundException('Content not found');

      if (current.status === ContentStatus.IN_REVIEW) {
        throw new ConflictException({
          code: 'CONTENT_UNDER_REVIEW',
          message:
            'Content under review cannot be edited; withdraw it from review first',
        });
      }
      if (current.status === ContentStatus.ARCHIVED) {
        throw new ConflictException({
          code: 'CONTENT_ARCHIVED',
          message: 'Archived content cannot be edited',
        });
      }

      const latest = await tx.contentRevision.aggregate({
        where: { contentId },
        _max: { revision: true },
      });
      const currentRevision = latest._max.revision ?? 0;

      if (
        dto.expectedRevision !== undefined &&
        dto.expectedRevision !== currentRevision
      ) {
        throw new ConflictException({
          code: 'CONTENT_REVISION_CONFLICT',
          message: 'Content changed since it was loaded',
        });
      }

      const title = dto.title ?? current.title;
      const body = dto.body ?? current.body;

      await tx.contentRevision.create({
        data: {
          contentId,
          clientId,
          revision: currentRevision + 1,
          title,
          body,
          contentHash: contentHashOf(title, body),
          createdByUserId: actorUserId,
        },
      });

      // Approved rule D7: an edit invalidates an existing confirmation.
      const reverts = current.status === ContentStatus.APPROVED;

      const updated = await tx.content.update({
        where: { id: contentId },
        data: {
          title,
          body,
          updatedByUserId: actorUserId,
          ...(reverts
            ? {
                status: ContentStatus.DRAFT,
                finalConfirmedAt: null,
                finalConfirmedByUserId: null,
                finalConfirmedRevisionId: null,
              }
            : {}),
        },
        select: CONTENT_SELECT,
      });

      if (reverts) {
        await tx.contentStatusEvent.create({
          data: {
            contentId,
            clientId,
            fromStatus: ContentStatus.APPROVED,
            toStatus: ContentStatus.DRAFT,
            actorUserId,
            actorRole: actor,
            note: 'edited after approval - final confirmation cleared',
          },
        });
      }

      return updated;
    });
  }
}