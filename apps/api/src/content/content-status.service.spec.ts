import { jest } from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { contentHashOf } from './content-hash.js';
import { ContentStatusService } from './content-status.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeTxMock() {
  return {
    content: { findFirst: jest.fn(), update: jest.fn() },
    contentRevision: { aggregate: jest.fn(), create: jest.fn() },
    contentStatusEvent: { create: jest.fn() },
  };
}

function makeService(tx: ReturnType<typeof makeTxMock>) {
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) =>
        callback(tx),
    ),
    content: { findFirst: jest.fn() },
    contentRevision: { findMany: jest.fn() },
    contentStatusEvent: { findMany: jest.fn() },
  };
  return {
    service: new ContentStatusService(prisma as unknown as PrismaService),
  };
}

describe('ContentStatusService.transition', () => {
  it('refuses APPROVED as a generic target (confirmation is the only door)', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
    });
    const { service } = makeService(tx);

    await expect(
      service.transition({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actor: 'CLIENT_OWNER',
        actorUserId: USER_ID,
        to: ContentStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.content.update).not.toHaveBeenCalled();
    expect(tx.contentStatusEvent.create).not.toHaveBeenCalled();
  });

  it('refuses archiving while in review (decision D2)', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
    });
    const { service } = makeService(tx);

    await expect(
      service.transition({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actor: 'CLIENT_OWNER',
        actorUserId: USER_ID,
        to: ContentStatus.ARCHIVED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an actor that may not perform the transition', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
    });
    const { service } = makeService(tx);

    await expect(
      service.transition({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actor: 'AGENCY_ADMIN',
        actorUserId: USER_ID,
        to: ContentStatus.CHANGES_REQUESTED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed for another Client (uniform 404, no existence leak)', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.transition({
        clientId: OTHER_CLIENT_ID,
        contentId: CONTENT_ID,
        actor: 'CLIENT_OWNER',
        actorUserId: USER_ID,
        to: ContentStatus.IN_REVIEW,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies a permitted transition and appends exactly one event', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.DRAFT,
    });
    asMock(tx.content.update).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
    });
    const { service } = makeService(tx);

    await service.transition({
      clientId: CLIENT_ID,
      contentId: CONTENT_ID,
      actor: 'AGENCY_ADMIN',
      actorUserId: USER_ID,
      to: ContentStatus.IN_REVIEW,
      note: 'ready for review',
    });

    expect(tx.content.update).toHaveBeenCalledTimes(1);
    expect(tx.contentStatusEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.contentStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: CLIENT_ID,
          fromStatus: ContentStatus.DRAFT,
          toStatus: ContentStatus.IN_REVIEW,
          actorRole: 'AGENCY_ADMIN',
        }),
      }),
    );
  });
});

describe('ContentStatusService.confirmFinal', () => {
  it('writes the immutable revision, the confirmation triple and the event together', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
      title: 'Final title',
      body: 'Final body',
      finalConfirmedAt: null,
    });
    asMock(tx.contentRevision.aggregate).mockResolvedValue({
      _max: { revision: 2 },
    });
    asMock(tx.contentRevision.create).mockResolvedValue({ id: 'rev-3' });
    asMock(tx.content.update).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.APPROVED,
    });
    const { service } = makeService(tx);

    await service.confirmFinal({
      clientId: CLIENT_ID,
      contentId: CONTENT_ID,
      actorUserId: USER_ID,
      note: 'approved by owner',
    });

    // 1. immutable snapshot of the exact approved text, hashed server-side
    expect(tx.contentRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: CLIENT_ID,
          revision: 3,
          title: 'Final title',
          body: 'Final body',
          contentHash: contentHashOf('Final title', 'Final body'),
          createdByUserId: USER_ID,
        }),
      }),
    );

    // 2. the COMPLETE confirmation triple, never partial
    const updateArgs = asMock(tx.content.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.status).toBe(ContentStatus.APPROVED);
    expect(updateArgs.data.finalConfirmedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.finalConfirmedByUserId).toBe(USER_ID);
    expect(updateArgs.data.finalConfirmedRevisionId).toBe('rev-3');

    // 3. append-only audit event
    expect(tx.contentStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: ContentStatus.IN_REVIEW,
          toStatus: ContentStatus.APPROVED,
          actorRole: 'CLIENT_OWNER',
        }),
      }),
    );
  });

  it('requires status IN_REVIEW', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.DRAFT,
      finalConfirmedAt: null,
    });
    const { service } = makeService(tx);

    await expect(
      service.confirmFinal({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.content.update).not.toHaveBeenCalled();
  });

  it('refuses to confirm an already confirmed item', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.IN_REVIEW,
      finalConfirmedAt: new Date(),
    });
    const { service } = makeService(tx);

    await expect(
      service.confirmFinal({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed for another Client (uniform 404)', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.confirmFinal({
        clientId: OTHER_CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.contentRevision.create).not.toHaveBeenCalled();
  });
});