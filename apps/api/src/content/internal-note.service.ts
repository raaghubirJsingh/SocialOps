import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { INTERNAL_NOTE_SELECT } from './content.select.js';

/**
 * InternalNote CRUD with STRICT AGENCY ISOLATION.
 *
 * Locked business rule (AGENTS.md §13 / Phase 2):
 *   - InternalNote rows are visible ONLY to the Agency (Organization) that
 *     authored them. The Client must NEVER see these notes.
 *   - Enforcement is at three layers:
 *     1. This service always filters by agencyId on reads.
 *     2. The agency controller never exposes notes to Client routes.
 *     3. The ClientBoundaryInterceptor strips any leaked data as defense-in-depth.
 *
 * Notes are insert-only (AGENTS.md §11): once created, they are never updated
 * or deleted. This preserves the audit trail of internal Agency discussions.
 *
 * Both human Managers and AI Bots (User with isBot = true) may author notes.
 * The authorId always points to the User who created the note, regardless of
 * whether they are human or AI.
 */
@Injectable()
export class InternalNoteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an internal note. The agencyId must match the calling Agency's
   * Organization id (enforced by the controller via @CurrentOrganization()).
   */
  async create(params: {
    contentId: string;
    clientId: string;
    agencyId: string;
    authorId: string;
    body: string;
  }) {
    const { contentId, clientId, agencyId, authorId, body } = params;

    return this.prisma.$transaction(async (tx) => {
      // Verify the Content belongs to this Client.
      const content = await tx.content.findFirst({
        where: { id: contentId, clientId },
        select: { id: true },
      });
      if (!content) throw new NotFoundException('Content not found');

      return tx.internalNote.create({
        data: {
          contentId,
          agencyId,
          authorId,
          body,
        },
        select: INTERNAL_NOTE_SELECT,
      });
    });
  }

  /**
   * List internal notes for a Content item. STRICTLY filtered by agencyId:
   * only the Agency that authored the notes can see them.
   *
   * This method must NEVER be called from a Client route.
   */
  async listForContent(
    clientId: string,
    contentId: string,
    agencyId: string,
  ) {
    // Verify the Content belongs to this Client.
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: { id: true },
    });
    if (!content) throw new NotFoundException('Content not found');

    return this.prisma.internalNote.findMany({
      where: { contentId, agencyId },
      select: INTERNAL_NOTE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Read a single internal note. STRICTLY filtered by agencyId.
   * This method must NEVER be called from a Client route.
   */
  async findOne(
    noteId: string,
    agencyId: string,
  ) {
    const note = await this.prisma.internalNote.findFirst({
      where: { id: noteId, agencyId },
      select: INTERNAL_NOTE_SELECT,
    });
    if (!note) {
      // Fail closed: an unknown note and a note from another Agency are
      // indistinguishable (no existence leak).
      throw new NotFoundException('Internal note not found');
    }
    return note;
  }
}