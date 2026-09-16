import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScenarioType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { CHANGE_REQUEST_SELECT } from './content.select.js';
import { isChangeRequestLocked } from './constants/content-transitions.js';

/**
 * ChangeRequest CRUD with the locked SCENARIO_1 limit enforcement.
 *
 * Business rule: a Content item with `scenarioType === SCENARIO_1` may have
 * at most 2 change requests. Further requests are rejected with a 400.
 * This limit is enforced server-side in this service; the database schema
 * carries no constraint (the limit is a business rule, not a data integrity
 * rule).
 *
 * Two gates are applied before a row is ever inserted:
 *   1. the item must not be locked (APPROVED / FINAL_CONFIRMED) or ARCHIVED -
 *      from those statuses the machine can only reach ARCHIVED, so a change
 *      request could never be honoured;
 *   2. the SCENARIO_1 cap of 2.
 *
 * ChangeRequest rows are insert-only (AGENTS.md §11): once created, they are
 * never updated or deleted. The Agency reviews and acts on them in the
 * service layer (future phase).
 */
@Injectable()
export class ChangeRequestService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a change request. Enforces the max-2 limit for SCENARIO_1.
   *
   * @param contentId - the Content item the request targets
   * @param clientId - the Client's id (tenant scope)
   * @param requestedById - the Client owner User who submitted the request
   * @param requestDetails - free-text description of the requested change
   */
  async create(params: {
    contentId: string;
    clientId: string;
    requestedById: string;
    requestDetails: string;
  }) {
    const { contentId, clientId, requestedById, requestDetails } = params;

    return this.prisma.$transaction(async (tx) => {
      // Serialize creators for this Content until commit/rollback. Scope the
      // lock itself to the Client; never lock another tenant's row.
      await tx.$queryRaw`
        SELECT "id" FROM "Content"
        WHERE "id" = ${contentId}::uuid AND "clientId" = ${clientId}::uuid
        FOR UPDATE
      `;
      // READ COMMITTED gives this read and the count a fresh snapshot after
      // any preceding creator releases the parent lock.
      const content = await tx.content.findFirst({
        where: { id: contentId, clientId },
        select: { id: true, scenarioType: true, status: true },
      });
      if (!content) throw new NotFoundException('Content not found');

      // Gate 1: locked (APPROVED / FINAL_CONFIRMED) or ARCHIVED content is
      // immutable - no change requests. Rejected with 400, the same class of
      // error as the limit below, because both are business-rule rejections.
      if (isChangeRequestLocked(content.status)) {
        throw new BadRequestException({
          code: 'CONTENT_IMMUTABLE',
          message: `Change requests are not allowed for ${content.status} content`,
        });
      }

      // Gate 2: enforce the max-2 limit for SCENARIO_1.
      if (content.scenarioType === ScenarioType.SCENARIO_1) {
        const count = await tx.changeRequest.count({
          where: { contentId },
        });
        if (count >= 2) {
          throw new BadRequestException({
            code: 'CHANGE_REQUEST_LIMIT_EXCEEDED',
            message:
              'SCENARIO_1 content allows a maximum of 2 change requests',
          });
        }
      }

      return tx.changeRequest.create({
        data: {
          contentId,
          requestedById,
          requestDetails,
        },
        select: CHANGE_REQUEST_SELECT,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /**
   * List change requests for a Content item (tenant-scoped).
   * Visible to both the Agency and the requesting Client.
   */
  async listForContent(clientId: string, contentId: string) {
    // Verify the Content belongs to this Client.
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, clientId },
      select: { id: true },
    });
    if (!content) throw new NotFoundException('Content not found');

    return this.prisma.changeRequest.findMany({
      where: { contentId },
      select: CHANGE_REQUEST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}