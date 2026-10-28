import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ContentService } from './content.service.js';
import { toClientContentView } from './content.select.js';

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

describe('toClientContentView legacy APPROVED projection (Decision 017)', () => {
  const base = {
    id: CONTENT_ID,
    title: 'Title',
    body: 'Body',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    clientId: CLIENT_ID,
  };

  it('maps FINAL_CONFIRMED to confirmed', () => {
    expect(
      toClientContentView({ ...base, status: 'FINAL_CONFIRMED' }).state,
    ).toBe('confirmed');
  });

  it('maps legacy APPROVED to draft_in_progress, never confirmed', () => {
    // Decision 017 retired APPROVED: the only V1 confirmation state is
    // FINAL_CONFIRMED. A legacy row must not render as confirmed.
    const view = toClientContentView({ ...base, status: 'APPROVED' });
    expect(view.state).toBe('draft_in_progress');
    expect(view.canRequestChanges).toBe(false);
    expect(view.canConfirmContent).toBe(false);
  });
});

describe('ContentService.create Decision 022 P2002 handling', () => {
  const REQUEST_ID = '55555555-5555-4555-8555-555555555555';

  function makeCreateHarness(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      clientAgencyRelationship: { findFirst: jest.fn(async () => null) },
      rawData: {
        findFirst: jest.fn(async () => ({ id: REQUEST_ID })),
      },
      content: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: CONTENT_ID })),
      },
      contentRevision: { create: jest.fn(async () => ({})) },
      $queryRaw: jest.fn(async () => undefined),
      ...txOverrides,
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: unknown) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new ContentService(prisma as unknown as PrismaService);
    return { service, tx };
  }

  function p2002(target: unknown) {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: { target } },
    );
  }

  it('maps a sourceRequestId unique conflict to CONTENT_REQUEST_ALREADY_DRAFTED', async () => {
    const { service } = makeCreateHarness({
      content: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => {
          throw p2002(['sourceRequestId']);
        }),
      },
    });

    const error = await service
      .create({
        clientId: CLIENT_ID,
        actorUserId: USER_ID,
        agencyId: 'org-1',
        sourceRequestId: REQUEST_ID,
        dto: { title: 'A', body: 'A' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as { response: unknown }).response).toEqual({
      code: 'CONTENT_REQUEST_ALREADY_DRAFTED',
      message: 'A draft already exists for this Content Request',
    });
  });

  it('recognises the index-name string shape of the same constraint', async () => {
    const { service } = makeCreateHarness({
      content: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => {
          throw p2002('Content_sourceRequestId_key');
        }),
      },
    });

    const error = await service
      .create({
        clientId: CLIENT_ID,
        actorUserId: USER_ID,
        agencyId: 'org-1',
        sourceRequestId: REQUEST_ID,
        dto: { title: 'A', body: 'A' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(
      ((error as { response: { code: string } }).response).code,
    ).toBe('CONTENT_REQUEST_ALREADY_DRAFTED');
  });

  it('rethrows an unrelated unique violation unchanged', async () => {
    const unrelated = p2002(['clientId', 'platform', 'platformAccountId']);
    const { service } = makeCreateHarness({
      content: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => {
          throw unrelated;
        }),
      },
    });

    const error = await service
      .create({
        clientId: CLIENT_ID,
        actorUserId: USER_ID,
        agencyId: 'org-1',
        sourceRequestId: REQUEST_ID,
        dto: { title: 'A', body: 'A' },
      })
      .catch((e: unknown) => e);
    expect(error).toBe(unrelated);
  });
});
