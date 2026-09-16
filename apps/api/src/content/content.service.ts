import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgencyRelationshipStatus, ContentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { CLIENT_CONTENT_SELECT, CONTENT_SELECT } from './content.select.js';
import { isContentImmutable } from './constants/content-transitions.js';
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
 *
 * Phase 2 (Unified Content & AI Foundation) adds one more gate: an edit of
 * FINAL_CONFIRMED (locked) content is rejected with 409 CONTENT_LOCKED, so the
 * frozen revision a Client confirmed can never be rewritten. `scenarioType` is
 * never editable - it is classification metadata fixed at creation.
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

  /**
   * Client-safe list (Phase 2 strict data boundary).
   *
   * Identical tenant scoping to `listForClient`, but every row is projected
   * through CLIENT_CONTENT_SELECT so `agencyId` and `internalNotes` never leave
   * PostgreSQL in the first place. This is the query-level half of the Client
   * isolation guarantee; ClientBoundaryInterceptor is the second half.
   */
  listForOwningClient(clientId: string, filters: ListContentQuery) {
    return this.prisma.content.findMany({
      where: {
        clientId,
        ...(filters.status ? { status: filters.status } : {}),
      },
      select: CLIENT_CONTENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: filters.take,
    });
  }

  /**
   * Client-safe single read (Phase 2 strict data boundary): a miss - including a
   * miss caused by another Client's contentId - is a uniform 404.
   */
  async findOneForOwningClient(clientId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: CLIENT_CONTENT_SELECT,
    });
    if (!content) throw new NotFoundException('Content not found');
    return content;
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
   *
   * `agencyId` is the VERIFIED organization id resolved server-side by the
   * agency controller - never a client-supplied value - and is snapshotted so
   * the managing Agency at creation time stays auditable even if the Client
   * later moves to a different Agency. When the caller is the Client itself
   * (no organization context), the ACTIVE ClientAgencyRelationship is read
   * inside the same transaction instead; a Client with no active Agency simply
   * records NULL. `scenarioType` is optional classification for the
   * 3-scenario pipeline.
   */
  async create(params: {
    clientId: string;
    actorUserId: string;
    agencyId?: string;
    dto: CreateContentDto;
  }) {
    const { clientId, actorUserId, dto } = params;

    return this.prisma.$transaction(async (tx) => {
      // The managing Agency is always resolved server-side. A caller-supplied
      // value is used only after the agency controller has proven it is the
      // verified organization context AND the Client is in its scope.
      const agencyId =
        params.agencyId ??
        (
          await tx.clientAgencyRelationship.findFirst({
            where: { clientId, status: AgencyRelationshipStatus.ACTIVE },
            select: { organizationId: true },
          })
        )?.organizationId ??
        null;

      const content = await tx.content.create({
        data: {
          clientId,
          title: dto.title,
          body: dto.body,
          status: ContentStatus.DRAFT,
          scenarioType: dto.scenarioType ?? null,
          agencyId,
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
      // Phase 2 final-confirmation gate: FINAL_CONFIRMED text is FROZEN. Unlike
      // the APPROVED revert (rule D7) there is no edit path out of it - the
      // confirmation triple is never cleared, so no further revision may exist.
      if (isContentImmutable(current.status)) {
        throw new ConflictException({
          code: 'CONTENT_LOCKED',
          message: `Content is locked at ${current.status} and cannot be edited`,
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