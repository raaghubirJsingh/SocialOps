import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONTENT_REVISION_SELECT,
  INTERNAL_NOTE_SELECT,
} from './content.select.js';
import { isContentImmutable } from './constants/content-transitions.js';
import { contentHashOf } from './content-hash.js';
import { LlmService } from './ai/llm.service.js';

/**
 * AI Agent Foundation (Phase 2 - Unified Content & AI Foundation).
 *
 * This service provides the foundation for AI Employee Fleet operations.
 * AI employees are first-class User entities with `isBot = true` and a
 * `skillSpecialization` (e.g. "AI Copywriter", "Video Editor"). They operate
 * strictly under the existing MEMBER RBAC role (AGENTS.md §7).
 *
 * The LLM call is delegated to a modular provider layer (see ./ai/): OpenAI,
 * Anthropic, or a deterministic mock fallback. This service owns only
 * authorization/scoping, audit-trail persistence, and the status-lock gate.
 *
 * AI-generated output is saved as either:
 *   - A new ContentRevision (if the task produces content text), or
 *   - An InternalNote (if the task produces an internal commentary/analysis).
 *
 * The `aiUserId` is always recorded as `createdByUserId` / `authorId` to
 * maintain a clear audit trail (AGENTS.md §11).
 *
 * Authorization (AGENTS.md §7): the AI Employee is a first-class User with
 * `isBot = true` that holds the ordinary MEMBER role in the calling Agency's
 * Organization. It gets NO new role and NO elevated permission; the MEMBER
 * membership is re-verified server-side on every dispatch, so `isBot` can never
 * be used as an authorization shortcut.
 *
 * Final-confirmation lock: while content is FINAL_CONFIRMED the frozen text must
 * not change, so a `revision` output is refused (409 CONTENT_LOCKED). An
 * `internal-note` output stays allowed - a note is agency-internal, insert-only
 * commentary that cannot alter the confirmed artifact.
 */
@Injectable()
export class AIAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Process an AI task for a Content item.
   *
   * @param contentId - the Content item the AI is working on
   * @param clientId - the Client's id (tenant scope)
   * @param aiUserId - the AI User's id (must have isBot = true)
   * @param agencyId - the Agency's Organization id (for internal notes)
   * @param prompt - the task description / prompt for the AI
   * @param outputType - whether to save as a ContentRevision or InternalNote
   */
  async processAiTask(params: {
    contentId: string;
    clientId: string;
    aiUserId: string;
    agencyId: string;
    prompt: string;
    outputType: 'revision' | 'internal-note';
  }) {
    const { contentId, clientId, aiUserId, agencyId, prompt, outputType } =
      params;

    // Phase 1 - verify (no transaction). Authorization + tenant scope are
    // proven before any external call, so the LLM round-trip never holds a
    // database connection open.
    const aiUser = await this.prisma.user.findUnique({
      where: { id: aiUserId },
      select: { id: true, isBot: true, skillSpecialization: true },
    });
    if (!aiUser || !aiUser.isBot) {
      throw new BadRequestException({
        code: 'AI_USER_REQUIRED',
        message: 'The aiUserId must reference a User with isBot = true',
      });
    }

    // The AI Employee must hold the ordinary MEMBER role in THIS Agency's
    // Organization. AI never gets an RBAC role of its own (AGENTS.md §7),
    // and membership is re-verified on every dispatch rather than trusted
    // from the request.
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: aiUserId, organizationId: agencyId },
      select: { role: true },
    });
    if (membership?.role !== OrganizationRole.MEMBER) {
      throw new ForbiddenException({
        code: 'AI_EMPLOYEE_NOT_MEMBER',
        message: 'The AI Employee must be a MEMBER of the calling Organization',
      });
    }

    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: { id: true, title: true, status: true },
    });
    if (!content) throw new NotFoundException('Content not found');

    // Final-confirmation lock: the frozen text may not gain a revision.
    if (outputType === 'revision' && isContentImmutable(content.status)) {
      throw new ConflictException({
        code: 'CONTENT_LOCKED',
        message: `Content is locked at ${content.status}; no new revision may be created`,
      });
    }

    // Phase 2 - generate (outside any transaction). Timeout + error mapping to
    // 502/503 lives in the provider layer, not here.
    const generated = await this.llm.generate({
      prompt,
      skillSpecialization: aiUser.skillSpecialization,
      contentTitle: content.title,
      outputType,
    });

    // Phase 3 - persist (transactional so the revision counter, authorId and
    // contentHash write are atomic).
    return this.prisma.$transaction(async (tx) => {
      if (outputType === 'revision') {
        const latest = await tx.contentRevision.aggregate({
          where: { contentId },
          _max: { revision: true },
        });
        const nextRevision = (latest._max.revision ?? 0) + 1;

        return tx.contentRevision.create({
          data: {
            contentId,
            clientId,
            revision: nextRevision,
            title: generated.title,
            body: generated.body,
            contentHash: contentHashOf(generated.title, generated.body),
            createdByUserId: aiUserId,
          },
          select: CONTENT_REVISION_SELECT,
        });
      }

      return tx.internalNote.create({
        data: {
          contentId,
          agencyId,
          authorId: aiUserId,
          body: generated.body,
        },
        select: INTERNAL_NOTE_SELECT,
      });
    });
  }
}
