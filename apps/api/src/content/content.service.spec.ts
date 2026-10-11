import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ContentService } from './content.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeTxMock() {
  return {
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
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
  };
  return new ContentService(prisma as unknown as PrismaService);
}

describe('ContentService.update final-confirmation lock', () => {
  it('locks the tenant-scoped row before rechecking status and refuses confirmed content', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue({
      id: CONTENT_ID,
      status: ContentStatus.FINAL_CONFIRMED,
      title: 'Confirmed title',
      body: 'Confirmed body',
    });
    const service = makeService(tx);

    await expect(
      service.update({
        clientId: CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
        actor: 'AGENCY_ADMIN',
        dto: { title: 'Changed title' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const [strings, contentId, clientId] = asMock(tx.$queryRaw).mock
      .calls[0] as [TemplateStringsArray, string, string];
    expect(strings.join('?')).toMatch(
      /SELECT "id" FROM "Content"\s+WHERE "id" = \?::uuid\s+AND "clientId" = \?::uuid\s+FOR UPDATE/,
    );
    expect([contentId, clientId]).toEqual([CONTENT_ID, CLIENT_ID]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.content.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.contentRevision.create).not.toHaveBeenCalled();
    expect(tx.content.update).not.toHaveBeenCalled();
  });

  it('does not acquire or read another Client’s Content row when the scoped lock misses', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(null);
    const service = makeService(tx);

    await expect(
      service.update({
        clientId: OTHER_CLIENT_ID,
        contentId: CONTENT_ID,
        actorUserId: USER_ID,
        actor: 'CLIENT_OWNER',
        dto: { body: 'Changed body' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(asMock(tx.$queryRaw).mock.calls[0]).toContain(CONTENT_ID);
    expect(asMock(tx.$queryRaw).mock.calls[0]).toContain(OTHER_CLIENT_ID);
    expect(tx.contentRevision.create).not.toHaveBeenCalled();
    expect(tx.content.update).not.toHaveBeenCalled();
  });
});
