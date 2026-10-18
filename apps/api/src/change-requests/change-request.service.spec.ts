import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { Decision009ChangeRequestService } from './change-request.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = '55555555-5555-4555-8555-555555555555';
const organizationId = ORGANIZATION_ID;
const CONTENT_ID = '99999999-9999-4999-8999-999999999999';
const CHANGE_REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeTxMock() {
  return {
    clientAgencyRelationship: {
      findFirst: jest.fn(),
    },
    content: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    changeRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    contentStatusEvent: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  };
}

function makeService(tx: ReturnType<typeof makeTxMock>) {
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    ),
    clientAgencyRelationship: tx.clientAgencyRelationship,
    content: tx.content,
    changeRequest: tx.changeRequest,
    contentStatusEvent: tx.contentStatusEvent,
  };
  return {
    service: new Decision009ChangeRequestService(prisma as unknown as PrismaService),
    prisma,
  };
}

function baseContent(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTENT_ID,
    clientId: CLIENT_ID,
    agencyId: ORGANIZATION_ID,
    status: 'DRAFT',
    ...overrides,
  };
}

describe('Decision009ChangeRequestService', () => {
  describe('createChangeRequest', () => {
    it('throws when content is not part of the active relationship', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue(undefined);
      const { service } = makeService(tx);

      await expect(
        service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        }),
      ).rejects.toThrow('Client not found for this organization');
    });

    it('throws when content is not found', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
      asMock(tx.content.findFirst).mockResolvedValue(undefined);
      const { service } = makeService(tx);

      await expect(
        service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        }),
      ).rejects.toThrow('Content not found');
    });

    it('throws when content does not belong to the client', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
      // The service's findFirst uses a where clause that already scopes by
      // clientId and agencyId, so a cross-tenant content simply returns null.
      asMock(tx.content.findFirst).mockResolvedValue(null);
      const { service } = makeService(tx);

      await expect(
        service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        }),
      ).rejects.toThrow('Content not found');
    });

    it('throws when content status is not DRAFT', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
      asMock(tx.content.findFirst).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'IN_REVIEW' });
      const { service } = makeService(tx);

      await expect(
        service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        }),
      ).rejects.toThrow('Content cannot transition from IN_REVIEW to UNDER_CLIENT_REVIEW');
    });

    it('throws when change request creation fails', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
      asMock(tx.content.findFirst).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'DRAFT' });
      asMock(tx.changeRequest.create).mockRejectedValue(new Error('DB error'));

      const { service } = makeService(tx);
      await expect(
        service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        }),
      ).rejects.toThrow('DB error');
    });

    it('creates a change request and transitions content to UNDER_CLIENT_REVIEW', async () => {
      const tx = makeTxMock();
      asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
      asMock(tx.content.findFirst).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'DRAFT' });
      asMock(tx.changeRequest.create).mockResolvedValue({ id: CHANGE_REQUEST_ID });
      asMock(tx.content.update).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'UNDER_CLIENT_REVIEW' });
      asMock(tx.contentStatusEvent.create).mockResolvedValue(undefined);

      const { service } = makeService(tx);
      const result = await service.createChangeRequest({
        organizationId,
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
        actorRole: 'AGENCY_ADMIN',
        requestDetails: 'Initial review request',
      });

      expect(result.id).toBe(CHANGE_REQUEST_ID);
      expect(tx.content.update).toHaveBeenCalledWith({
        where: { id: CONTENT_ID },
        data: { status: 'UNDER_CLIENT_REVIEW' },
      });
      expect(tx.contentStatusEvent.create).toHaveBeenCalledWith({
        data: {
          contentId: CONTENT_ID,
          clientId: CLIENT_ID,
          fromStatus: 'DRAFT',
          toStatus: 'UNDER_CLIENT_REVIEW',
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'Initial review request',
        },
      });
    });

    it('uses a Prisma transaction for createChangeRequest', async () => {
        const tx = makeTxMock();
        asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
        asMock(tx.content.findFirst).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'DRAFT' });
        asMock(tx.changeRequest.create).mockResolvedValue({ id: CHANGE_REQUEST_ID });
        asMock(tx.content.update).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'UNDER_CLIENT_REVIEW' });
        asMock(tx.contentStatusEvent.create).mockResolvedValue(undefined);

        const { service, prisma } = makeService(tx);
        await service.createChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          contentId: CONTENT_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          requestDetails: 'test',
        });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('rejects when actor role is not AGENCY_ADMIN for createChangeRequest', async () => {
        const tx = makeTxMock();
        asMock(tx.clientAgencyRelationship.findFirst).mockResolvedValue({ status: 'ACTIVE' });
        asMock(tx.content.findFirst).mockResolvedValue({ id: CONTENT_ID, clientId: CLIENT_ID, agencyId: ORGANIZATION_ID, status: 'DRAFT' });
        const { service } = makeService(tx);

        await expect(
          service.createChangeRequest({
            organizationId,
            clientId: CLIENT_ID,
            contentId: CONTENT_ID,
            actorUserId: USER_ID,
            actorRole: 'CLIENT_OWNER',
            requestDetails: 'test',
          }),
        ).rejects.toThrow("Actor role CLIENT_OWNER may not transition content from DRAFT to UNDER_CLIENT_REVIEW");
      });
  });

  describe('confirmChangeRequest', () => {
    it('throws when change request does not exist', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue(undefined);
      const { service } = makeService(tx);

      await expect(
        service.confirmChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          changeRequestId: CHANGE_REQUEST_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'approve',
        }),
      ).rejects.toThrow('Change request not found');
    });

    it('throws when the associated content does not belong to the organization', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: OTHER_CLIENT_ID,
          status: 'UNDER_CLIENT_REVIEW',
        },
      });
      const { service } = makeService(tx);

      await expect(
        service.confirmChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          changeRequestId: CHANGE_REQUEST_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'approve',
        }),
      ).rejects.toThrow('Content not owned by this organization');
    });

    it('throws when content status is not UNDER_CLIENT_REVIEW', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: ORGANIZATION_ID,
          status: 'DRAFT',
        },
      });
      const { service } = makeService(tx);

      await expect(
        service.confirmChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          changeRequestId: CHANGE_REQUEST_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'approve',
        }),
      ).rejects.toThrow('Content is not in UNDER_CLIENT_REVIEW status');
    });

    it('throws when confirm fails', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: ORGANIZATION_ID,
          status: 'UNDER_CLIENT_REVIEW',
        },
      });
      asMock(tx.content.update).mockRejectedValue(new Error('DB error'));

      const { service } = makeService(tx);
      await expect(
        service.confirmChangeRequest({
          organizationId,
          clientId: CLIENT_ID,
          changeRequestId: CHANGE_REQUEST_ID,
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'approve',
        }),
      ).rejects.toThrow('DB error');
    });

    it('transitions content to AWAITING_MANAGER_APPROVAL and records event', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: ORGANIZATION_ID,
          status: 'UNDER_CLIENT_REVIEW',
        },
      });
      asMock(tx.content.update).mockResolvedValue({
        id: CONTENT_ID,
        clientId: CLIENT_ID,
        agencyId: ORGANIZATION_ID,
        status: 'AWAITING_MANAGER_APPROVAL',
      });
      asMock(tx.contentStatusEvent.create).mockResolvedValue(undefined);

      const { service } = makeService(tx);
      const result = await service.confirmChangeRequest({
        organizationId,
        clientId: CLIENT_ID,
        changeRequestId: CHANGE_REQUEST_ID,
        actorUserId: USER_ID,
        actorRole: 'AGENCY_ADMIN',
        note: 'approve',
      });

      expect(result.status).toBe('AWAITING_MANAGER_APPROVAL');
      expect(tx.content.update).toHaveBeenCalledWith({
        where: { id: CONTENT_ID },
        data: { status: 'AWAITING_MANAGER_APPROVAL' },
      });
      expect(tx.contentStatusEvent.create).toHaveBeenCalledWith({
        data: {
          contentId: CONTENT_ID,
          clientId: CLIENT_ID,
          fromStatus: 'UNDER_CLIENT_REVIEW',
          toStatus: 'AWAITING_MANAGER_APPROVAL',
          actorUserId: USER_ID,
          actorRole: 'AGENCY_ADMIN',
          note: 'approve',
        },
      });
    });

    it('uses a Prisma transaction for confirmChangeRequest', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: ORGANIZATION_ID,
          status: 'UNDER_CLIENT_REVIEW',
        },
      });
      asMock(tx.content.update).mockResolvedValue({
        id: CONTENT_ID,
        clientId: CLIENT_ID,
        agencyId: ORGANIZATION_ID,
        status: 'AWAITING_MANAGER_APPROVAL',
      });
      asMock(tx.contentStatusEvent.create).mockResolvedValue(undefined);

      const { service, prisma } = makeService(tx);
      await service.confirmChangeRequest({
        organizationId,
        clientId: CLIENT_ID,
        changeRequestId: CHANGE_REQUEST_ID,
        actorUserId: USER_ID,
        actorRole: 'AGENCY_ADMIN',
        note: 'approve',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('permits CLIENT_OWNER to confirm change request (pre-existing authority)', async () => {
      const tx = makeTxMock();
      asMock(tx.changeRequest.findUnique).mockResolvedValue({
        id: CHANGE_REQUEST_ID,
        content: {
          id: CONTENT_ID,
          clientId: CLIENT_ID,
          agencyId: ORGANIZATION_ID,
          status: 'UNDER_CLIENT_REVIEW',
        },
      });
      asMock(tx.content.update).mockResolvedValue({
        id: CONTENT_ID,
        clientId: CLIENT_ID,
        agencyId: ORGANIZATION_ID,
        status: 'AWAITING_MANAGER_APPROVAL',
      });
      asMock(tx.contentStatusEvent.create).mockResolvedValue(undefined);

      const { service } = makeService(tx);
      const result = await service.confirmChangeRequest({
        organizationId,
        clientId: CLIENT_ID,
        changeRequestId: CHANGE_REQUEST_ID,
        actorUserId: USER_ID,
        actorRole: 'CLIENT_OWNER',
        note: 'approve',
      });

      expect(result.status).toBe('AWAITING_MANAGER_APPROVAL');
      expect(tx.contentStatusEvent.create).toHaveBeenCalledWith({
        data: {
          contentId: CONTENT_ID,
          clientId: CLIENT_ID,
          fromStatus: 'UNDER_CLIENT_REVIEW',
          toStatus: 'AWAITING_MANAGER_APPROVAL',
          actorUserId: USER_ID,
          actorRole: 'CLIENT_OWNER',
          note: 'approve',
        },
      });
    });
  });

});

