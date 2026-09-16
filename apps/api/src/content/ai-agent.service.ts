import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { CONTENT_REVISION_SELECT, INTERNAL_NOTE_SELECT } from './content.select.js';
import { isContentImmutable } from './constants/content-transitions.js';
import { contentHashOf } from './content-hash.js';

/**
 * AI Agent Foundation (Phase 2 - Unified Content & AI Foundation).
 *
 * This service provides the foundation for AI Employee Fleet operations.
 * AI employees are first-class User entities with `isBot = true` and a
 * `skillSpecialization` (e.g. "AI Copywriter", "Video Editor"). They operate
 * strictly under the existing MEMBER RBAC role (AGENTS.md §7).
 *
 * The actual LLM integration is MOCKED in this phase: `processAiTask()`
 * returns a deterministic placeholder response. A future phase will replace
 * the mock with a real LLM call (the interface is designed to accommodate this).
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
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      // 1. Verify the AI User exists and is a bot.
      const aiUser = await tx.user.findUnique({
        where: { id: aiUserId },
        select: { id: true, isBot: true, skillSpecialization: true },
      });
      if (!aiUser || !aiUser.isBot) {
        throw new BadRequestException({
          code: 'AI_USER_REQUIRED',
          message: 'The aiUserId must reference a User with isBot = true',
        });
      }

      // 1b. The AI Employee must hold the ordinary MEMBER role in THIS Agency's
      //     Organization. AI never gets an RBAC role of its own (AGENTS.md §7),
      //     and membership is re-verified on every dispatch rather than trusted
      //     from the request.
      const membership = await tx.organizationMembership.findFirst({
        where: { userId: aiUserId, organizationId: agencyId },
        select: { role: true },
      });
      if (membership?.role !== OrganizationRole.MEMBER) {
        throw new ForbiddenException({
          code: 'AI_EMPLOYEE_NOT_MEMBER',
          message:
            'The AI Employee must be a MEMBER of the calling Organization',
        });
      }

      // 2. Verify the Content belongs to this Client.
      const content = await tx.content.findFirst({
        where: { id: contentId, clientId },
        select: { id: true, title: true, body: true, status: true },
      });
      if (!content) throw new NotFoundException('Content not found');

      // 2b. Final-confirmation lock: the frozen text may not gain a revision.
      if (outputType === 'revision' && isContentImmutable(content.status)) {
        throw new ConflictException({
          code: 'CONTENT_LOCKED',
          message: `Content is locked at ${content.status}; no new revision may be created`,
        });
      }

      // 3. Mock the LLM call. In a future phase, this will be replaced with
      //    a real LLM API call using the prompt and skillSpecialization.
      const mockResponse = this.mockLLMCall(
        prompt,
        aiUser.skillSpecialization,
        content.title,
      );

      // 4. Save the output.
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
            title: mockResponse.title,
            body: mockResponse.body,
            contentHash: contentHashOf(mockResponse.title, mockResponse.body),
            createdByUserId: aiUserId,
          },
          select: CONTENT_REVISION_SELECT,
        });
      } else {
        return tx.internalNote.create({
          data: {
            contentId,
            agencyId,
            authorId: aiUserId,
            body: mockResponse.body,
          },
          select: INTERNAL_NOTE_SELECT,
        });
      }
    });
  }

  /**
   * Mock LLM call. Returns a placeholder response built from the prompt and the
   * AI Employee's declared skill. In a future phase, this will be replaced with
   * a real LLM API call.
   */
  private mockLLMCall(
    prompt: string,
    skillSpecialization: string | null,
    contentTitle: string,
  ): { title: string; body: string } {
    const skill = skillSpecialization ?? 'General AI Assistant';
    return {
      title: `[AI Draft - ${skill}] ${contentTitle}`,
      body: [
        `## AI-Generated Response`,
        ``,
        `**Skill:** ${skill}`,
        `**Prompt:** ${prompt}`,
        ``,
        `This is a mock LLM response. In a future phase, this will be replaced`,
        `with a real LLM API call that generates content based on the prompt`,
        `and the AI employee's skill specialization.`,
        ``,
        `---`,
        ``,
        `*Generated by ${skill} at ${new Date().toISOString()}*`,
      ].join('\n'),
    };
  }
}