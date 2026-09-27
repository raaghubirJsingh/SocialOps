import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { ListSocialAccountsQuery } from './dto/list-social-accounts.dto.js';
import {
  SOCIAL_ACCOUNT_LIST_SELECT,
  SOCIAL_ACCOUNT_SELECT,
  SocialAccountsService,
} from './social-accounts.service.js';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

const NO_FILTERS: ListSocialAccountsQuery = { take: 50 };

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

function makePrismaMock() {
  return {
    socialAccount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    // Declared so the "metadata row is never deleted" assertion can prove it.
    deleteMany: jest.fn(),
  },
    socialAccountCredential: { deleteMany: jest.fn() },
    clientEvent: { create: jest.fn() },
  };
}

describe('SocialAccountsService - hasCredential projection', () => {
  it('exposes only an existence boolean, never the credential itself', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findMany).mockResolvedValue([
      {
        id: ACCOUNT_ID,
        clientId: CLIENT_ID,
        platform: 'INSTAGRAM',
        credential: { id: 'cred-1' },
      },
    ]);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const [row] = await service.listForClient(CLIENT_ID, NO_FILTERS);

    expect(row.hasCredential).toBe(true);
    // The relation itself must never reach the wire.
    expect(row).not.toHaveProperty('credential');
  });

  it('reports hasCredential false when no credential row exists', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findMany).mockResolvedValue([
      { id: ACCOUNT_ID, clientId: CLIENT_ID, platform: 'YOUTUBE', credential: null },
    ]);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const [row] = await service.listForClient(CLIENT_ID, NO_FILTERS);

    expect(row.hasCredential).toBe(false);
  });

  it('probes the credential by id only - no secret field is ever selected', () => {
    expect(SOCIAL_ACCOUNT_LIST_SELECT.credential).toEqual({
      select: { id: true },
    });
    // The base metadata allowlist stays free of any credential relation.
    expect(SOCIAL_ACCOUNT_SELECT).not.toHaveProperty('credential');
    const serialised = JSON.stringify(SOCIAL_ACCOUNT_LIST_SELECT).toLowerCase();
    for (const forbidden of ['ciphertext', 'accesstoken', 'refreshtoken', 'scopes', 'tokenkeyversion']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('SocialAccountsService - disconnect', () => {
  it('deletes ONLY the credential and preserves the metadata row', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 1 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID);

    // Tenant-scoped: the credential is reached only through the proven account.
    expect(asMock(prisma.socialAccount.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { id: ACCOUNT_ID, clientId: CLIENT_ID },
    });
    expect(asMock(prisma.socialAccountCredential.deleteMany).mock.calls[0]![0]).toMatchObject({
      where: { socialAccountId: ACCOUNT_ID },
    });
    // The metadata row is NEVER deleted - only the credential is.
    expect(asMock(prisma.socialAccount.deleteMany)).not.toHaveBeenCalled();
  });

  it('writes a security audit event', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'INSTAGRAM',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 1 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID);

    expect(asMock(prisma.clientEvent.create).mock.calls[0]![0]).toMatchObject({
      data: {
        clientId: CLIENT_ID,
        actorUserId: ACTOR_ID,
        action: 'social-account.oauth.disconnected',
      },
    });
  });

  it('is idempotent - a repeated call removes nothing and still succeeds', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'YOUTUBE',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 0 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID),
    ).resolves.toBeUndefined();
  });

  it('404s an out-of-scope account and never touches the credential', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      service.disconnect(OTHER_CLIENT_ID, ACCOUNT_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(asMock(prisma.socialAccountCredential.deleteMany)).not.toHaveBeenCalled();
    expect(asMock(prisma.clientEvent.create)).not.toHaveBeenCalled();
  });
});
