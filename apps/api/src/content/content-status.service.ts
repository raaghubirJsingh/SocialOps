import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONTENT_REVISION_SELECT,
  CONTENT_SELECT,
  CONTENT_STATUS_EVENT_SELECT,
} from './content.select.js';
import { contentHashOf } from './content-hash.js';
import {
  canTransition,
  isContentImmutable,
  mayActorPerform,
  type ContentTransitionActor,
} from './constants/content-transitions.js';

/**
 * Content status machine + Final Confirmation (Client Operations V1).
 *
 * This service is the ONLY place that writes `Content.status`. The approved
 * guarantees live here:
 *   - the transition whitelist (constants/content-transitions.ts) is enforced
 *     server-side on every call;
 *   - the actor authority matrix is enforced server-side: review decisions are
 *     CLIENT OWNER only, and Final Confirmation is client-owner-only (D4);
 *   - `confirmFinal()` writes the confirmation triple ATOMICALLY with the
 *     immutable revision and the audit event, so there is never a state where
 *     the status flips without the triple (the DB CHECK constraint is the
 *     second line of defence).
 *
 * Publishing remains deferred (AGENTS.md section 13): APPROVED is terminal.
 */
@Injectable()
export class ContentStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append-only transition history for one Content item (tenant-scoped). */
  async listStatusEvents(clientId: string, contentId: string) {
    await this.assertContentInScope(clientId, contentId);
    return this.prisma.contentStatusEvent.findMany({
      where: { clientId, contentId },
      select: CONTENT_STATUS_EVENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Insert-only revision history for one Content item (tenant-scoped). */
  async listRevisions(clientId: string, contentId: string) {
    await this.assertContentInScope(clientId, contentId);
    return this.prisma.contentRevision.findMany({
      where: { clientId, contentId },
      select: CONTENT_REVISION_SELECT,
      orderBy: { revision: 'desc' },
      take: 200,
    });
  }

  /**
   * A generic status transition (never to APPROVED - see confirmFinal()).
   *
   * Runs entirely inside one transaction: the scoped re-read, the whitelist and
   * authority checks, the status write, and the append-only event are one unit
   * of work, so a rejected transition writes nothing.
   */
  async transition(params: {
    clientId: string;
    contentId: string;
    actor: ContentTransitionActor;
    actorUserId: string;
    to: ContentStatus;
    note?: string;
  }) {
    const { clientId, contentId, actor, actorUserId, to, note } = params;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.content.findFirst({
        where: { id: contentId, clientId },
        select: { id: true, status: true },
      });
      if (!current) throw new NotFoundException('Content not found');

      if (to === ContentStatus.APPROVED) {
        throw new ConflictException({
          code: 'CONFIRMATION_REQUIRED',
          message:
            'APPROVED is reachable only through the final-confirmation endpoint',
        });
      }
      if (to === ContentStatus.FINAL_CONFIRMED) {
        throw new ConflictException({
          code: 'FINAL_LOCK_REQUIRED',
          message:
            'FINAL_CONFIRMED is reachable only through the final-confirmed-lock endpoint',
        });
      }
      if (!canTransition(current.status, to)) {
        throw new ConflictException({
          code: 'INVALID_CONTENT_TRANSITION',
          message: `Cannot move Content from ${current.status} to ${to}`,
        });
      }
      if (!mayActorPerform(actor, current.status, to)) {
        throw new ForbiddenException({
          code: 'TRANSITION_NOT_PERMITTED_FOR_ACTOR',
          message: 'This actor may not perform this transition',
        });
      }

      const updated = await tx.content.update({
        where: { id: current.id },
        data: {
          status: to,
          ...(to === ContentStatus.ARCHIVED ? { archivedAt: new Date() } : {}),
        },
        select: CONTENT_SELECT,
      });

      await tx.contentStatusEvent.create({
        data: {
          contentId: current.id,
          clientId,
          fromStatus: current.status,
          toStatus: to,
          actorUserId,
          actorRole: actor,
          note: note ?? null,
        },
      });

      return updated;
    });
  }

  /**
   * FINAL CONFIRMATION - the single door to APPROVED (client owner only).
   *
   * One transaction performs all four writes:
   *   1. append the immutable ContentRevision snapshot of the exact text;
   *   2. record its SHA-256 via `contentHashOf(title, body)`;
   *   3. write the confirmation triple (at / by / revision id) on Content;
   *   4. append the IN_REVIEW -> APPROVED audit event.
   *
   * Either every write lands or none does, and the DB CHECK constraint
   * `Content_approved_requires_final_confirmation` refuses an approved row
   * missing any element, so a future Publishing step can always trust that an
   * APPROVED item carries a verifiable confirmation.
   */
  async confirmFinal(params: {
    clientId: string;
    contentId: string;
    actorUserId: string;
    note?: string;
  }) {
    const { clientId, contentId, actorUserId, note } = params;

    return this.prisma.$transaction(async (tx) => {
      const content = await tx.content.findFirst({
        where: { id: contentId, clientId },
      });
      if (!content) throw new NotFoundException('Content not found');

      if (content.finalConfirmedAt !== null) {
        throw new ConflictException({
          code: 'ALREADY_CONFIRMED',
          message: 'Content already carries a final confirmation',
        });
      }
      if (content.status !== ContentStatus.IN_REVIEW) {
        throw new ConflictException({
          code: 'INVALID_CONTENT_STATUS',
          message: 'Final confirmation requires status IN_REVIEW',
        });
      }

      const latest = await tx.contentRevision.aggregate({
        where: { contentId },
        _max: { revision: true },
      });

      const snapshot = await tx.contentRevision.create({
        data: {
          contentId,
          clientId,
          revision: (latest._max.revision ?? 0) + 1,
          title: content.title,
          body: content.body,
          contentHash: contentHashOf(content.title, content.body),
          createdByUserId: actorUserId,
        },
      });

      const updated = await tx.content.update({
        where: { id: contentId },
        data: {
          status: ContentStatus.APPROVED,
          finalConfirmedAt: new Date(),
          finalConfirmedByUserId: actorUserId,
          finalConfirmedRevisionId: snapshot.id,
          updatedByUserId: actorUserId,
        },
        select: CONTENT_SELECT,
      });

      await tx.contentStatusEvent.create({
        data: {
          contentId,
          clientId,
          fromStatus: ContentStatus.IN_REVIEW,
          toStatus: ContentStatus.APPROVED,
          actorUserId,
          actorRole: 'CLIENT_OWNER',
          note: note ?? null,
        },
      });

      return updated;
    });
  }

  /**
   * FINAL CONFIRMATION LOCK - the single door to FINAL_CONFIRMED (client owner).
   *
   * Where confirmFinal() is the Client Operations V1 door to APPROVED, this is
   * the Phase 2 door to the locked FINAL_CONFIRMED state of the 3-scenario
   * pipeline. It performs the same four atomic writes:
   *   1. append the immutable ContentRevision snapshot of the exact text;
   *   2. record its SHA-256 via `contentHashOf(title, body)`;
   *   3. write the confirmation triple (at / by / revision id) on Content;
   *   4. append the UNDER_CLIENT_REVIEW -> FINAL_CONFIRMED audit event.
   *
   * The triple is what makes the lock verifiable rather than merely asserted:
   * `isContentImmutable()` refuses further edits and revisions downstream, the
   * status machine allows only ARCHIVED from FINAL_CONFIRMED, and a future
   * Publishing step can trust the frozen revision hash.
   *
   * FINAL_CONFIRMED is reachable ONLY here: the generic transition route refuses
   * it as a target (see ContentStatusService.transition), exactly like APPROVED.
   */
  async confirmFinalLocked(params: {
    clientId: string;
    contentId: string;
    actorUserId: string;
    note?: string;
  }) {
    const { clientId, contentId, actorUserId, note } = params;

    return this.prisma.$transaction(async (tx) => {
      const content = await tx.content.findFirst({
        where: { id: contentId, clientId },
      });
      if (!content) throw new NotFoundException('Content not found');

      // Idempotency / double-lock guard: an item that is already locked can
      // never be locked again (and never silently re-snapshotted).
      if (isContentImmutable(content.status)) {
        throw new ConflictException({
          code: 'CONTENT_LOCKED',
          message: `Content is locked at ${content.status} and cannot be changed`,
        });
      }
      if (content.status !== ContentStatus.UNDER_CLIENT_REVIEW) {
        throw new ConflictException({
          code: 'INVALID_CONTENT_STATUS',
          message: 'Final confirmation lock requires status UNDER_CLIENT_REVIEW',
        });
      }

      const latest = await tx.contentRevision.aggregate({
        where: { contentId },
        _max: { revision: true },
      });

      const snapshot = await tx.contentRevision.create({
        data: {
          contentId,
          clientId,
          revision: (latest._max.revision ?? 0) + 1,
          title: content.title,
          body: content.body,
          contentHash: contentHashOf(content.title, content.body),
          createdByUserId: actorUserId,
        },
      });

      const updated = await tx.content.update({
        where: { id: contentId },
        data: {
          status: ContentStatus.FINAL_CONFIRMED,
          finalConfirmedAt: new Date(),
          finalConfirmedByUserId: actorUserId,
          finalConfirmedRevisionId: snapshot.id,
          updatedByUserId: actorUserId,
        },
        select: CONTENT_SELECT,
      });

      await tx.contentStatusEvent.create({
        data: {
          contentId,
          clientId,
          fromStatus: ContentStatus.UNDER_CLIENT_REVIEW,
          toStatus: ContentStatus.FINAL_CONFIRMED,
          actorUserId,
          actorRole: 'CLIENT_OWNER',
          note: note ?? null,
        },
      });

      return updated;
    });
  }

  /** Tenant-scoped existence check: a miss is a uniform 404. */
  private async assertContentInScope(clientId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: { id: true },
    });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }
}