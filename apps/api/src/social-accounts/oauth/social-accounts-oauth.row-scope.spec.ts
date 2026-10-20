import 'reflect-metadata';

import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { SocialAccountsOAuthService } from './social-accounts-oauth.service.js';
import {
  FacebookOAuthProvider,
  InstagramOAuthProvider,
} from './providers/facebook-graph.oauth.js';
import { YouTubeOAuthProvider } from './providers/youtube.oauth.js';

/**
 * ROW-SCOPED OAuth connect (the "connect an EXISTING SocialAccount" fix).
 *
 * The defect these tests pin: the platform-scoped connect minted a state with
 * NO row reference, and the callback then upserted on
 * (clientId, platform, platformAccountId). A row that had not yet recorded a
 * platformAccountId stores NULL there, so the composite could never match it and
 * Prisma CREATED A SECOND ROW - leaving the original card permanently stuck at
 * "Platform id not recorded" and asking the user to type an id by hand.
 *
 * Covered here:
 *   - connect start proves the row belongs to the client BEFORE minting state,
 *     and takes the platform FROM the row;
 *   - callback re-proves actor + relationship + row ownership, then UPDATES the
 *     intended row instead of upserting;
 *   - the platform-scoped path is untouched (still upserts, still works).
 *
 * No real platform is contacted: only the adapters' exchange/profile methods are
 * stubbed, so no credential, network call or secret is involved.
 */

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '33333333-3333-4333-8333-333333333333';

// Test-only provider credentials so the REAL adapters can build URLs. Literals
// in a test file, never the developer's environment.
process.env.INSTAGRAM_CLIENT_ID ??= 'test-instagram-client-id';
process.env.INSTAGRAM_CLIENT_SECRET ??= 'test-instagram-client-secret';
process.env.FACEBOOK_CLIENT_ID ??= 'test-facebook-client-id';
process.env.FACEBOOK_CLIENT_SECRET ??= 'test-facebook-client-secret';
process.env.YOUTUBE_CLIENT_ID ??= 'test-youtube-client-id';
process.env.YOUTUBE_CLIENT_SECRET ??= 'test-youtube-client-secret';
process.env.OAUTH_REDIRECT_BASE_URL ??= 'http://localhost:4000';

const USER = { sub: 'user-owner' } as never;

const BASE_PAYLOAD = {
  sub: 'user-owner',
  organizationId: 'org-socialops',
  clientId: CLIENT_ID,
  platform: 'INSTAGRAM',
  source: 'CLIENT',
} as const;
/** Transaction handle recording which writes the service actually issued. */
interface FakeTx {
  socialAccount: {
    update: jest.Mock;
    upsert: jest.Mock;
    create: jest.Mock;
  };
  socialAccountCredential: { upsert: jest.Mock };
  clientEvent: { create: jest.Mock };
}

function makeRowService(over: {
  /** Row the client-scoped lookup resolves to; null models "not in this client". */
  row?: { id: string; platform: string } | null;
  relationshipActive?: boolean;
  ownsClient?: boolean;
  isMember?: boolean;
} = {}) {
  const row =
    over.row === undefined ? { id: ROW_ID, platform: 'INSTAGRAM' } : over.row;
  const relationshipActive =
    over.relationshipActive === undefined ? true : over.relationshipActive;
  const ownsClient = over.ownsClient === undefined ? true : over.ownsClient;
  const isMember = over.isMember === undefined ? true : over.isMember;

  const socialAccountFindFirst = jest.fn(async () => row);
  const credentialUpsert = jest.fn(async () => ({}));
  const clientEventCreate = jest.fn(async () => ({}));

  const tx: FakeTx = {
    socialAccount: {
      update: jest.fn(async () => ({ id: ROW_ID })),
      upsert: jest.fn(async () => ({ id: ROW_ID })),
      create: jest.fn(async () => ({ id: ROW_ID })),
    },
    socialAccountCredential: { upsert: credentialUpsert },
    clientEvent: { create: clientEventCreate },
  };

  const prisma = {
    socialAccount: { findFirst: socialAccountFindFirst },
    // `requireActiveManagingOrganization` resolves the managing org from the
    // ACTIVE relationship row directly.
    clientAgencyRelationship: {
      findFirst: jest.fn(async () =>
        relationshipActive ? { organizationId: 'org-socialops' } : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(async () => (isMember ? { id: 'mem-1' } : null)),
    },
    client: {
      findFirst: jest.fn(async () => (ownsClient ? { id: CLIENT_ID } : null)),
      findUnique: jest.fn(async () => ({ ownerUserId: 'user-owner' })),
    },
    $transaction: jest.fn(async (fn: (t: FakeTx) => Promise<void>) => fn(tx)),
  };

  const clientsService = {
    getClientForOrganization: jest.fn(async () =>
      relationshipActive ? { id: CLIENT_ID } : null,
    ),
  };
  const state = {
    mint: jest.fn(async () => 'state.signed.payload'),
    consume: jest.fn(),
  };
  const crypto = {
    encrypt: jest.fn(() => ({
      tokenKeyVersion: 1,
      ciphertext: 'sealed-do-not-use',
    })),
  };

  const service = new SocialAccountsOAuthService(
    prisma as never,
    clientsService as never,
    state as never,
    crypto as never,
    {
      requireOnboardingActive: jest.fn(async () => undefined),
      requireActiveSocialAccount: jest.fn(async () => undefined),
    } as never,
  );
  return { service, state, prisma, tx, clientsService, crypto };
}

/** Stub the adapter network calls; returns the discovered profile per platform. */
function stubProviders(profile = {
  platformAccountId: 'platform-discovered-id',
  displayName: 'Discovered Name',
}) {
  const calls = {
    instagram: {
      exchange: jest.fn(async () => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
        scope: 's',
      })),
      fetch: jest.fn(async () => profile),
    },
    facebook: {
      exchange: jest.fn(async () => ({ accessToken: 'at-fb', expiresIn: 60 })),
      fetch: jest.fn(async () => ({ platformAccountId: 'fb-id' })),
    },
    youtube: {
      exchange: jest.fn(async () => ({ accessToken: 'at-yt', expiresIn: 60 })),
      fetch: jest.fn(async () => ({ platformAccountId: 'yt-id' })),
    },
  };
  const spies = [
    jest
      .spyOn(InstagramOAuthProvider.prototype, 'exchangeCode')
      .mockImplementation(calls.instagram.exchange),
    jest
      .spyOn(InstagramOAuthProvider.prototype, 'fetchProfile')
      .mockImplementation(calls.instagram.fetch),
    jest
      .spyOn(FacebookOAuthProvider.prototype, 'exchangeCode')
      .mockImplementation(calls.facebook.exchange),
    jest
      .spyOn(FacebookOAuthProvider.prototype, 'fetchProfile')
      .mockImplementation(calls.facebook.fetch),
    jest
      .spyOn(YouTubeOAuthProvider.prototype, 'exchangeCode')
      .mockImplementation(calls.youtube.exchange),
    jest
      .spyOn(YouTubeOAuthProvider.prototype, 'fetchProfile')
      .mockImplementation(calls.youtube.fetch),
  ];
  return {
    calls,
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
describe('startConnectAgencyForAccount (row-scoped, agency persona)', () => {
  it('mints state carrying the row id, with the platform read FROM the row', async () => {
    const { service, state } = makeRowService();
    await service.startConnectAgencyForAccount(
      USER,
      'org-socialops',
      CLIENT_ID,
      ROW_ID,
    );

    expect(state.mint).toHaveBeenCalledWith({
      sub: 'user-owner',
      organizationId: 'org-socialops',
      clientId: CLIENT_ID,
      platform: 'INSTAGRAM',
      socialAccountId: ROW_ID,
      source: 'AGENCY',
    });
  });

  it('scopes the row lookup by clientId, never by a bare row id', async () => {
    const { service, prisma } = makeRowService();
    await service.startConnectAgencyForAccount(
      USER,
      'org-socialops',
      CLIENT_ID,
      ROW_ID,
    );

    // Client-supplied ownership is never trusted: the query itself enforces it.
    expect(prisma.socialAccount.findFirst).toHaveBeenCalledWith({
      where: { id: ROW_ID, clientId: CLIENT_ID },
      select: { id: true, platform: true },
    });
  });

  it("returns the provider's authorize URL bound to the signed state", async () => {
    const { service } = makeRowService();
    const res = await service.startConnectAgencyForAccount(
      USER,
      'org-socialops',
      CLIENT_ID,
      ROW_ID,
    );

    const url = new URL(res.authorizeUrl);
    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.searchParams.get('state')).toBe('state.signed.payload');
    // Instagram scopes on the Instagram row, not the Facebook set.
    expect(url.searchParams.get('scope')).toContain('instagram_basic');
  });

  it('uses the ROW platform for a YouTube row, not a hard-coded Instagram flow', async () => {
    const { service, state } = makeRowService({
      row: { id: ROW_ID, platform: 'YOUTUBE' },
    });
    const res = await service.startConnectAgencyForAccount(
      USER,
      'org-socialops',
      CLIENT_ID,
      ROW_ID,
    );

    expect(state.mint).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'YOUTUBE' }),
    );
    expect(res.authorizeUrl).toContain('accounts.google.com');
  });

  it('refuses a row that belongs to ANOTHER client, and mints no state', async () => {
    const { service, state, prisma } = makeRowService({ row: null });
    const err = await service
      .startConnectAgencyForAccount(USER, 'org-socialops', CLIENT_ID, ROW_ID)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    // Uniform 404: indistinguishable from a row that never existed.
    expect(String((err as Error).message)).toBe('Social account not found');
    expect(state.mint).not.toHaveBeenCalled();
    expect(prisma.socialAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROW_ID, clientId: CLIENT_ID },
      }),
    );
  });

  it('refuses before the row lookup when the relationship is not ACTIVE', async () => {
    const { service, state, prisma } = makeRowService({
      relationshipActive: false,
    });
    const err = await service
      .startConnectAgencyForAccount(USER, 'org-socialops', CLIENT_ID, ROW_ID)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect(state.mint).not.toHaveBeenCalled();
    expect(prisma.socialAccount.findFirst).not.toHaveBeenCalled();
  });
});

describe('startConnectClientForAccount (row-scoped, client persona)', () => {
  it('mints state as the client OWNER, with the row id and the row platform', async () => {
    const { service, state } = makeRowService();
    await service.startConnectClientForAccount(CLIENT_ID, ROW_ID);

    expect(state.mint).toHaveBeenCalledWith({
      // The owner user id read from the database - never client-supplied.
      sub: 'user-owner',
      organizationId: 'org-socialops',
      clientId: CLIENT_ID,
      platform: 'INSTAGRAM',
      socialAccountId: ROW_ID,
      source: 'CLIENT',
    });
  });

  it("returns the provider's authorize URL, not the bare signed state", async () => {
    const { service } = makeRowService();
    const res = await service.startConnectClientForAccount(CLIENT_ID, ROW_ID);
    expect(new URL(res.authorizeUrl).searchParams.get('state')).toBe(
      'state.signed.payload',
    );
  });

  it("refuses another client's row with a uniform 404", async () => {
    const { service, state } = makeRowService({ row: null });
    const err = await service
      .startConnectClientForAccount(CLIENT_ID, ROW_ID)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect(state.mint).not.toHaveBeenCalled();
  });

  it('refuses an unmanaged client before touching the row', async () => {
    const { service, state, prisma } = makeRowService({
      relationshipActive: false,
    });
    const err = await service
      .startConnectClientForAccount(CLIENT_ID, ROW_ID)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(prisma.socialAccount.findFirst).not.toHaveBeenCalled();
    expect(state.mint).not.toHaveBeenCalled();
  });
});
describe('completeConnect with socialAccountId (the duplicate-row fix)', () => {
  it('UPDATES the intended row and never creates a second one', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        socialAccountId: ROW_ID,
      } as never);

      expect(tx.socialAccount.update).toHaveBeenCalledWith({
        where: { id: ROW_ID },
        data: {
          platformAccountId: 'platform-discovered-id',
          displayName: 'Discovered Name',
        },
        select: { id: true },
      });
      // THE regression guard: neither the composite upsert nor a create.
      expect(tx.socialAccount.upsert).not.toHaveBeenCalled();
      expect(tx.socialAccount.create).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });

  it('attaches exactly one credential to that same row', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        socialAccountId: ROW_ID,
      } as never);

      expect(tx.socialAccountCredential.upsert).toHaveBeenCalledTimes(1);
      const arg = tx.socialAccountCredential.upsert.mock.calls[0]![0] as {
        where: { socialAccountId: string };
        create: { socialAccountId: string };
      };
      // Keyed to the UPDATED row, not to a freshly created one.
      expect(arg.where.socialAccountId).toBe(ROW_ID);
      expect(arg.create.socialAccountId).toBe(ROW_ID);
    } finally {
      p.restore();
    }
  });

  it('does NOT rewrite the immutable platform on the row', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        socialAccountId: ROW_ID,
      } as never);

      const data = (tx.socialAccount.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      }).data;
      expect(data).not.toHaveProperty('platform');
      expect(data).not.toHaveProperty('clientId');
    } finally {
      p.restore();
    }
  });

  it('records the audit event against the same client and actor', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        socialAccountId: ROW_ID,
      } as never);

      expect(tx.clientEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: CLIENT_ID,
          actorUserId: 'user-owner',
          action: 'social-account.oauth.connected',
        }),
      });
    } finally {
      p.restore();
    }
  });

  it('re-proves the row is still inside the client at CALLBACK time', async () => {
    const p = stubProviders();
    try {
      const { service, prisma } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        socialAccountId: ROW_ID,
      } as never);

      expect(prisma.socialAccount.findFirst).toHaveBeenCalledWith({
        where: { id: ROW_ID, clientId: CLIENT_ID },
        select: { id: true, platform: true },
      });
    } finally {
      p.restore();
    }
  });

  it('fails with a uniform 404 and NO provider call when the row was deleted after minting', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({ row: null });
      const err = await service
        .completeConnect('INSTAGRAM', 'auth-code', {
          ...BASE_PAYLOAD,
          socialAccountId: ROW_ID,
        } as never)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      // The re-proof runs BEFORE the exchange, so a vanished row costs no
      // outbound call and no token exchange.
      expect(p.calls.instagram.exchange).not.toHaveBeenCalled();
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
      expect(tx.socialAccountCredential.upsert).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });

  it('refuses a row whose platform disagrees with the signed state', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({
        row: { id: ROW_ID, platform: 'FACEBOOK' },
      });
      const err = await service
        .completeConnect('INSTAGRAM', 'auth-code', {
          ...BASE_PAYLOAD,
          socialAccountId: ROW_ID,
        } as never)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
      expect(p.calls.instagram.exchange).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });
it('still re-proves the ACTING USER is authorized for the tenant', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({ ownsClient: false });
      const err = await service
        .completeConnect('INSTAGRAM', 'auth-code', {
          ...BASE_PAYLOAD,
          socialAccountId: ROW_ID,
        } as never)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });

  it('still re-proves the relationship is ACTIVE for the AGENCY source', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({ relationshipActive: false });
      const err = await service
        .completeConnect('INSTAGRAM', 'auth-code', {
          ...BASE_PAYLOAD,
          sub: 'agency-user',
          source: 'AGENCY',
          socialAccountId: ROW_ID,
        } as never)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });

  it('runs the platform-specific provider for a Facebook row', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({
        row: { id: ROW_ID, platform: 'FACEBOOK' },
      });
      await service.completeConnect('FACEBOOK', 'auth-code', {
        ...BASE_PAYLOAD,
        platform: 'FACEBOOK',
        socialAccountId: ROW_ID,
      } as never);

      expect(p.calls.facebook.exchange).toHaveBeenCalledTimes(1);
      expect(p.calls.instagram.exchange).not.toHaveBeenCalled();
      expect(tx.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ platformAccountId: 'fb-id' }),
        }),
      );
    } finally {
      p.restore();
    }
  });

  it('runs the platform-specific provider for a YouTube row', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService({
        row: { id: ROW_ID, platform: 'YOUTUBE' },
      });
      await service.completeConnect('YOUTUBE', 'auth-code', {
        ...BASE_PAYLOAD,
        platform: 'YOUTUBE',
        socialAccountId: ROW_ID,
      } as never);

      expect(p.calls.youtube.exchange).toHaveBeenCalledTimes(1);
      expect(tx.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ platformAccountId: 'yt-id' }),
        }),
      );
    } finally {
      p.restore();
    }
  });

  it('rejects a state whose platform does not match the callback platform', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      const err = await service
        .completeConnect('FACEBOOK', 'auth-code', {
          ...BASE_PAYLOAD,
          socialAccountId: ROW_ID,
        } as never)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });
});

describe('completeConnect without socialAccountId (backward compatibility)', () => {
  it('keeps the original composite upsert and still creates a row', async () => {
    const p = stubProviders();
    try {
      const { service, tx } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
      } as never);

      expect(tx.socialAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clientId_platform_platformAccountId: {
              clientId: CLIENT_ID,
              platform: 'INSTAGRAM',
              platformAccountId: 'platform-discovered-id',
            },
          },
        }),
      );
      expect(tx.socialAccount.update).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });

  it('does not query the SocialAccount table at all for a row-less state', async () => {
    const p = stubProviders();
    try {
      const { service, prisma } = makeRowService();
      await service.completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
      } as never);

      expect(prisma.socialAccount.findFirst).not.toHaveBeenCalled();
    } finally {
      p.restore();
    }
  });
});

describe('cross-client row reuse', () => {
  it("cannot aim one client's row at another client's tenant", async () => {
    const { service, state, prisma } = makeRowService({ row: null });
    await service
      .startConnectAgencyForAccount(
        USER,
        'org-socialops',
        OTHER_CLIENT_ID,
        ROW_ID,
      )
      .catch((e: unknown) => e);

    // The requested client is the one in the query, so the lookup cannot be
    // satisfied by a row belonging to a different tenant.
    expect(prisma.socialAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROW_ID, clientId: OTHER_CLIENT_ID },
      }),
    );
    expect(state.mint).not.toHaveBeenCalled();
  });
});