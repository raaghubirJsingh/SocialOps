import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentStatus, ScenarioType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ChangeRequestService } from './change-request.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeTxMock() {
  return {
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    content: { findFirst: jest.fn() },
    changeRequest: { count: jest.fn(), create: jest.fn() },
  };
}

function makeService(tx: ReturnType<typeof makeTxMock>) {
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) =>
        callback(tx),
    ),
    content: { findFirst: jest.fn() },
    changeRequest: { findMany: jest.fn() },
  };
  return {
    service: new ChangeRequestService(prisma as unknown as PrismaService),
    prisma,
  };
}

function baseContent(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTENT_ID,
    scenarioType: ScenarioType.SCENARIO_1,
    status: ContentStatus.IN_REVIEW,
    ...overrides,
  };
}

describe('ChangeRequestService.create - SCENARIO_1 cap of 2 (LOCKED)', () => {
  it('locks the tenant-scoped parent before reading, counting, and inserting', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(baseContent());
    asMock(tx.changeRequest.count).mockResolvedValue(0);
    asMock(tx.changeRequest.create).mockResolvedValue({ id: 'cr-1' });
    const { service, prisma } = makeService(tx);

    await service.create({
      contentId: CONTENT_ID,
      clientId: CLIENT_ID,
      requestedById: USER_ID,
      requestDetails: 'First change',
    });

    const [strings, contentId, clientId] = asMock(tx.$queryRaw).mock.calls[0] as [
      TemplateStringsArray, string, string,
    ];
    expect(strings.join('?')).toMatch(
      /SELECT "id" FROM "Content"\s+WHERE "id" = \?::uuid AND "clientId" = \?::uuid\s+FOR UPDATE/,
    );
    expect([contentId, clientId]).toEqual([CONTENT_ID, CLIENT_ID]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.content.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.content.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.changeRequest.count.mock.invocationCallOrder[0],
    );
    expect(tx.changeRequest.count.mock.invocationCallOrder[0]).toBeLessThan(
      tx.changeRequest.create.mock.invocationCallOrder[0],
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'ReadCommitted' },
    );
  });

  it('awaits the lock and performs no reads or writes if locking fails', async () => {
    const tx = makeTxMock();
    let rejectLock!: (reason: Error) => void;
    tx.$queryRaw.mockImplementation(() => new Promise<unknown[]>((_, reject) => {
      rejectLock = reject;
    }));
    const { service } = makeService(tx);
    const pending = service.create({
      contentId: CONTENT_ID,
      clientId: CLIENT_ID,
      requestedById: USER_ID,
      requestDetails: 'Waiting for lock',
    });
    const failure = new Error('Lock unavailable');
    const assertion = expect(pending).rejects.toBe(failure);
    expect(tx.content.findFirst).not.toHaveBeenCalled();
    expect(tx.changeRequest.count).not.toHaveBeenCalled();
    expect(tx.changeRequest.create).not.toHaveBeenCalled();
    rejectLock(failure);
    await assertion;
    expect(tx.content.findFirst).not.toHaveBeenCalled();
    expect(tx.changeRequest.create).not.toHaveBeenCalled();
  });

  it('allows a request when only 1 exists for SCENARIO_1', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(baseContent());
    asMock(tx.changeRequest.count).mockResolvedValue(1);
    asMock(tx.changeRequest.create).mockResolvedValue({ id: 'cr-2' });
    const { service } = makeService(tx);

    await service.create({
      contentId: CONTENT_ID,
      clientId: CLIENT_ID,
      requestedById: USER_ID,
      requestDetails: 'Please change the headline',
    });

    expect(tx.changeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentId: CONTENT_ID,
          requestedById: USER_ID,
          requestDetails: 'Please change the headline',
        }),
      }),
    );
  });

  it('blocks the 3rd request for SCENARIO_1 with 400', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(baseContent());
    asMock(tx.changeRequest.count).mockResolvedValue(2);
    const { service } = makeService(tx);

    await expect(
      service.create({
        contentId: CONTENT_ID,
        clientId: CLIENT_ID,
        requestedById: USER_ID,
        requestDetails: 'A third change',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.changeRequest.create).not.toHaveBeenCalled();
  });

  for (const scenario of [
    ScenarioType.SCENARIO_2,
    ScenarioType.SCENARIO_3,
  ]) {
    it(`does NOT apply the cap to ${scenario}`, async () => {
      const tx = makeTxMock();
      asMock(tx.content.findFirst).mockResolvedValue(
        baseContent({ scenarioType: scenario }),
      );
      asMock(tx.changeRequest.create).mockResolvedValue({ id: 'cr-9' });
      const { service } = makeService(tx);

      await service.create({
        contentId: CONTENT_ID,
        clientId: CLIENT_ID,
        requestedById: USER_ID,
        requestDetails: 'Unlimited in this scenario',
      });

      expect(tx.changeRequest.count).not.toHaveBeenCalled();
      expect(tx.changeRequest.create).toHaveBeenCalled();
    });
  }

  it('does NOT apply the cap to unclassified (NULL) content', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(
      baseContent({ scenarioType: null }),
    );
    asMock(tx.changeRequest.create).mockResolvedValue({ id: 'cr-9' });
    const { service } = makeService(tx);

    await service.create({
      contentId: CONTENT_ID,
      clientId: CLIENT_ID,
      requestedById: USER_ID,
      requestDetails: 'Unclassified content',
    });

    expect(tx.changeRequest.count).not.toHaveBeenCalled();
    expect(tx.changeRequest.create).toHaveBeenCalled();
  });
});

describe('ChangeRequestService.create - immutable gate', () => {
  for (const status of [
    ContentStatus.FINAL_CONFIRMED,
    ContentStatus.APPROVED,
    ContentStatus.ARCHIVED,
  ]) {
    it(`refuses a change request when status is ${status}`, async () => {
      const tx = makeTxMock();
      asMock(tx.content.findFirst).mockResolvedValue(baseContent({ status }));
      const { service } = makeService(tx);

      await expect(
        service.create({
          contentId: CONTENT_ID,
          clientId: CLIENT_ID,
          requestedById: USER_ID,
          requestDetails: 'Too late',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.changeRequest.create).not.toHaveBeenCalled();
    });
  }

  it('fails closed for another Client (uniform 404, no existence leak)', async () => {
    const tx = makeTxMock();
    asMock(tx.content.findFirst).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.create({
        contentId: CONTENT_ID,
        clientId: OTHER_CLIENT_ID,
        requestedById: USER_ID,
        requestDetails: 'Cross-tenant attempt',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.changeRequest.create).not.toHaveBeenCalled();
  });
});

describe('ChangeRequestService.listForContent - tenant scoping', () => {
  it('fails closed for another Client (uniform 404)', async () => {
    const tx = makeTxMock();
    const { service, prisma } = makeService(tx);
    asMock(prisma.content.findFirst).mockResolvedValue(null);

    await expect(
      service.listForContent(OTHER_CLIENT_ID, CONTENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.changeRequest.findMany).not.toHaveBeenCalled();
  });

  it('returns rows for the owning Client, newest first', async () => {
    const tx = makeTxMock();
    const { service, prisma } = makeService(tx);
    asMock(prisma.content.findFirst).mockResolvedValue({ id: CONTENT_ID });
    asMock(prisma.changeRequest.findMany).mockResolvedValue([{ id: 'cr-1' }]);

    await expect(
      service.listForContent(CLIENT_ID, CONTENT_ID),
    ).resolves.toEqual([{ id: 'cr-1' }]);

    expect(prisma.changeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentId: CONTENT_ID },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
