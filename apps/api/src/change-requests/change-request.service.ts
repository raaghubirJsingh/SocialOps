import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ContentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgencyRelationshipStatus } from '@prisma/client';
import {
  canTransition,
  mayActorPerform,
  type ContentTransitionActor,
} from '../content/constants/content-transitions.js';

export type CreateChangeRequestParams = {
  organizationId: string;
  clientId: string;
  contentId: string;
  actorUserId: string;
  actorRole: ContentTransitionActor;
  requestDetails: string;
};

export type ConfirmChangeRequestParams = {
  organizationId: string;
  clientId: string;
  changeRequestId: string;
  actorUserId: string;
  actorRole: ContentTransitionActor;
  note?: string;
};

@Injectable()
export class Decision009ChangeRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async createChangeRequest(params: CreateChangeRequestParams) {
    const {
      organizationId,
      clientId,
      contentId,
      actorUserId,
      actorRole,
      requestDetails,
    } = params;

    return this.prisma.$transaction(async (tx) => {
      // Serialize creators for this Content until commit/rollback.
      await tx.$queryRaw`
        SELECT "id" FROM "Content"
        WHERE "id" = ${contentId}::uuid AND "clientId" = ${clientId}::uuid
        FOR UPDATE
      `;

      // Ensure the client belongs to the organization via an ACTIVE relationship.
      const relationship = await tx.clientAgencyRelationship.findFirst({
        where: {
          clientId,
          organizationId,
          status: 'ACTIVE',
        },
      });
      if (!relationship) {
        throw new NotFoundException('Client not found for this organization');
      }

      // Fetch the content and verify it belongs to this client and organization.
      const content = await tx.content.findFirst({
        where: {
          id: contentId,
          clientId,
          agencyId: organizationId,
        },
        select: { id: true, clientId: true, status: true },
      });

      if (!content) {
        throw new NotFoundException('Content not found');
      }

      // Centralized transition authority: DRAFT -> UNDER_CLIENT_REVIEW by AGENCY_ADMIN.
      if (!canTransition(content.status, ContentStatus.UNDER_CLIENT_REVIEW)) {
        throw new BadRequestException(
          `Content cannot transition from ${content.status} to UNDER_CLIENT_REVIEW`,
        );
      }
      if (!mayActorPerform(actorRole, content.status, ContentStatus.UNDER_CLIENT_REVIEW)) {
        throw new BadRequestException(
          `Actor role ${actorRole} may not transition content from ${content.status} to UNDER_CLIENT_REVIEW`,
        );
      }

      // Create the change request row.
      const changeRequest = await tx.changeRequest.create({
        data: {
          contentId,
          requestedById: actorUserId,
          requestDetails,
        },
      });

      // Transition the content to UNDER_CLIENT_REVIEW.
      const updatedContent = await tx.content.update({
        where: { id: contentId },
        data: { status: ContentStatus.UNDER_CLIENT_REVIEW },
      });

      // Record an audit event for the transition.
      await tx.contentStatusEvent.create({
        data: {
          contentId: updatedContent.id,
          clientId: updatedContent.clientId,
          fromStatus: ContentStatus.DRAFT,
          toStatus: ContentStatus.UNDER_CLIENT_REVIEW,
          actorUserId,
          actorRole,
          note: requestDetails,
        },
      });

      return changeRequest;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async confirmChangeRequest(params: ConfirmChangeRequestParams) {
    const {
      organizationId,
      clientId,
      changeRequestId,
      actorUserId,
      actorRole,
      note,
    } = params;

    return this.prisma.$transaction(async (tx) => {
      // Load the change request (and its content) to validate ownership and status.
      const changeRequest = await tx.changeRequest.findUnique({
        where: { id: changeRequestId },
        include: { content: true },
      });

      if (!changeRequest) {
        throw new NotFoundException('Change request not found');
      }

      const content = changeRequest.content;
      if (!content) {
        throw new NotFoundException('Content associated with change request not found');
      }

      // Verify tenant isolation: content belongs to the same client and organization.
      if (content.clientId !== clientId || content.agencyId !== organizationId) {
        throw new NotFoundException('Content not owned by this organization');
      }

      // Serialize confirms for this Content until commit/rollback, using the
      // same tenant-scoped Content lock shape as create and legacy paths.
      await tx.$queryRaw`
        SELECT "id" FROM "Content"
        WHERE "id" = ${content.id}::uuid AND "clientId" = ${clientId}::uuid
        FOR UPDATE
      `;

      // Explicit state guard: confirm only operates on UNDER_CLIENT_REVIEW content.
      if (content.status !== ContentStatus.UNDER_CLIENT_REVIEW) {
        throw new BadRequestException('Content is not in UNDER_CLIENT_REVIEW status');
      }

      // Centralized transition authority: UNDER_CLIENT_REVIEW -> AWAITING_MANAGER_APPROVAL by AGENCY_ADMIN.
      if (
        !canTransition(content.status, ContentStatus.AWAITING_MANAGER_APPROVAL)
      ) {
        throw new BadRequestException(
          `Content cannot transition from ${content.status} to AWAITING_MANAGER_APPROVAL`,
        );
      }
      if (
        !mayActorPerform(
          actorRole,
          content.status,
          ContentStatus.AWAITING_MANAGER_APPROVAL,
        )
      ) {
        throw new BadRequestException(
          `Actor role ${actorRole} may not transition content from ${content.status} to AWAITING_MANAGER_APPROVAL`,
        );
      }

      // Transition content to AWAITING_MANAGER_APPROVAL.
      const updatedContent = await tx.content.update({
        where: { id: content.id },
        data: { status: ContentStatus.AWAITING_MANAGER_APPROVAL },
      });

      // Record the status transition event.
      await tx.contentStatusEvent.create({
        data: {
          contentId: updatedContent.id,
          clientId: updatedContent.clientId,
          fromStatus: ContentStatus.UNDER_CLIENT_REVIEW,
          toStatus: ContentStatus.AWAITING_MANAGER_APPROVAL,
          actorUserId,
          actorRole,
          note,
        },
      });

      return updatedContent;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}