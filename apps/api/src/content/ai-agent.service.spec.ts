import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, OrganizationRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { AIAgentService } from './ai-agent.service.js';
import { contentHashOf } from './content-hash.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const AGENCY_ID = '55555555-5555-4555-8555-555555555555';
const AI_USER_ID = '66666666-6666-4666-8666-666666666666';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeTxMock() {
  return {
    user: { findUnique: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    content: { findFirst: jest.fn() },
    contentRevision: { aggregate: jest.fn(), create: jest.fn() },
    internalNote: { create: jest.fn() },
  };
}

function makeService(tx: ReturnType<typeof makeTxMock>) {
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  return { service: new AIAgentService(prisma as unknown as PrismaService) };
}

/** Happy-path transaction mocks: a MEMBER bot acting on unlocked content. */
function primeHappyPath(
  tx: ReturnType<typeof makeTxMock>,
  status: ContentStatus = ContentStatus.DRAFT,
) {
  asMock(tx.user.findUnique).mockResolvedValue({
    id: AI_USER_ID,
    isBot: true,
    skillSpecialization: 'AI Copywriter',
  });
  asMock(tx.organizationMembership.findFirst).mockResolvedValue({
    role: OrganizationRole.MEMBER,
  });
  asMock(tx.content.findFirst).mockResolvedValue({
    id: CONTENT_ID,
    title: 'Launch post',
    body: 'Original body',
    status,
  });
}

const baseParams = {
  contentId: CONTENT_ID,
  clientId: CLIENT_ID,
  aiUserId: AI_USER_ID,
  agencyId: AGENCY_ID,
  prompt: 'Write a punchier headline',
};

describe('AIAgentService.processAiTask - AI Employee identity', () => {
  it('rejects a human user (isBot = false) with 400', async () => {
    const tx = makeTxMock();
    asMock(tx.user.findUnique).mockResolvedValue({
      id: AI_USER_ID,
      isBot: false,
      skillSpecialization: null,
    });
    const { service } = makeService(tx);

    await expect(
      service.processAiTask({ ...baseParams, outputType: 'internal-note' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown aiUserId with 400', async () => {
    const tx = makeTxMock();
    asMock(tx.user.findUnique).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.processAiTask({ ...baseParams, outputType: 'internal-note' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AIAgentService.processAiTask - MEMBER-only authorization', () => {
  it('rejects a bot that is not a member of the calling Organization', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.organizationMembership.findFirst).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.processAiTask({ ...baseParams, outputType: 'internal-note' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a bot holding ADMIN instead of MEMBER (least privilege)', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.organizationMembership.findFirst).mockResolvedValue({
      role: OrganizationRole.ADMIN,
    });
    const { service } = makeService(tx);

    await expect(
      service.processAiTask({ ...baseParams, outputType: 'internal-note' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AIAgentService.processAiTask - final-confirmation lock', () => {
  for (const status of [
    ContentStatus.FINAL_CONFIRMED,
    ContentStatus.ARCHIVED,
  ]) {
    it(`refuses a new revision while content is ${status}`, async () => {
      const tx = makeTxMock();
      primeHappyPath(tx, status);
      const { service } = makeService(tx);

      await expect(
        service.processAiTask({ ...baseParams, outputType: 'revision' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.contentRevision.create).not.toHaveBeenCalled();
    });

    it(`still allows an agency-internal note while content is ${status}`, async () => {
      const tx = makeTxMock();
      primeHappyPath(tx, status);
      asMock(tx.internalNote.create).mockResolvedValue({ id: 'note-1' });
      const { service } = makeService(tx);

      await expect(
        service.processAiTask({ ...baseParams, outputType: 'internal-note' }),
      ).resolves.toEqual({ id: 'note-1' });
    });
  }
});

describe('AIAgentService.processAiTask - audit trail', () => {
  it('persists a revision authored by the AI User itself', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.contentRevision.aggregate).mockResolvedValue({
      _max: { revision: 2 },
    });
    asMock(tx.contentRevision.create).mockResolvedValue({ id: 'rev-3' });
    const { service } = makeService(tx);

    await service.processAiTask({ ...baseParams, outputType: 'revision' });

    const args = asMock(tx.contentRevision.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.revision).toBe(3);
    expect(args.data.createdByUserId).toBe(AI_USER_ID);
    expect(args.data.clientId).toBe(CLIENT_ID);
    // The frozen-text hash is computed server-side, never accepted from input.
    expect(args.data.contentHash).toBe(
      contentHashOf(args.data.title as string, args.data.body as string),
    );
  });

  it('persists an internal note with the AI User as author', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.internalNote.create).mockResolvedValue({ id: 'note-1' });
    const { service } = makeService(tx);

    await service.processAiTask({ ...baseParams, outputType: 'internal-note' });

    expect(tx.internalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentId: CONTENT_ID,
          agencyId: AGENCY_ID,
          authorId: AI_USER_ID,
        }),
      }),
    );
  });

  it('falls back to a general skill label and never leaks the prompt elsewhere', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.user.findUnique).mockResolvedValue({
      id: AI_USER_ID,
      isBot: true,
      skillSpecialization: null,
    });
    asMock(tx.contentRevision.aggregate).mockResolvedValue({
      _max: { revision: null },
    });
    asMock(tx.contentRevision.create).mockResolvedValue({ id: 'rev-1' });
    const { service } = makeService(tx);

    await service.processAiTask({ ...baseParams, outputType: 'revision' });

    const args = asMock(tx.contentRevision.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.revision).toBe(1);
    expect(String(args.data.body)).toContain('General AI Assistant');
  });

  it('fails closed for another Client (uniform 404)', async () => {
    const tx = makeTxMock();
    primeHappyPath(tx);
    asMock(tx.content.findFirst).mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.processAiTask({
        ...baseParams,
        clientId: OTHER_CLIENT_ID,
        outputType: 'revision',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.contentRevision.create).not.toHaveBeenCalled();
  });
});
