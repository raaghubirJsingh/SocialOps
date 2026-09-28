import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { SocialAccountsOAuthService } from './social-accounts-oauth.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

// Test-only platform credentials so the REAL provider adapter can build a URL.
// These are literals in a test file, never the developer's environment.
process.env.INSTAGRAM_CLIENT_ID ??= 'test-instagram-client-id';
process.env.INSTAGRAM_CLIENT_SECRET ??= 'test-instagram-client-secret';
process.env.FACEBOOK_CLIENT_ID ??= 'test-facebook-client-id';
process.env.FACEBOOK_CLIENT_SECRET ??= 'test-facebook-client-secret';
process.env.OAUTH_REDIRECT_BASE_URL ??= 'http://localhost:4000';

/**
 * Client-side connect start (no database required).
 *
 * The unmanaged-Client refusal is APPROVED behavior (Decision 013: "uniform
 * 403 when the client is unmanaged") - these tests pin that the boundary is
 * intact AND that the refusal is machine-readable, so the UI can explain
 * the next step instead of showing a generic "not allowed".
 */
function makeService(over: {
  relationship?: { organizationId: string } | null;
  client?: { ownerUserId: string | null } | null;
} = {}) {
  const prisma = {
    clientAgencyRelationship: {
      findFirst: jest.fn(async () =>
        over.relationship === undefined ? { organizationId: 'org-1' } : over.relationship,
      ),
    },
    client: {
      findUnique: jest.fn(async () =>
        over.client === undefined ? { ownerUserId: 'user-1' } : over.client,
      ),
    },
  };
  const clientsService = { getClientForOrganization: jest.fn(async () => ({})) };
  // The real OAuthStateService.mint() returns the signed state STRING.
  const state = { mint: jest.fn(async () => 'state.signed.payload') };
  const crypto = {};
  const service = new SocialAccountsOAuthService(
    prisma as never,
    clientsService as never,
    state as never,
    crypto as never,
  );
  return { service, state, prisma };
}

describe('SocialAccountsOAuthService.startConnectClient', () => {
  it('mints state when the Client has an ACTIVE managing relationship', async () => {
    const { service, state } = makeService();
    const res = await service.startConnectClient(CLIENT_ID, 'INSTAGRAM');
    expect(res.expiresIn).toBe(600);
    expect(state.mint).toHaveBeenCalledWith({
      sub: 'user-1',
      organizationId: 'org-1',
      clientId: CLIENT_ID,
      platform: 'INSTAGRAM',
      source: 'CLIENT',
    });
  });

  it('returns the PROVIDER authorization URL, never the bare signed state', async () => {
    const { service } = makeService();
    const res = await service.startConnectClient(CLIENT_ID, 'INSTAGRAM');

    // Regression pin: the response is a NAVIGATION target. Returning the
    // state string here made the browser leave for a base64url value instead
    // of the platform.
    expect(res.authorizeUrl).not.toBe('state.signed.payload');

    const url = new URL(res.authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://www.facebook.com/v21.0/dialog/oauth',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-instagram-client-id');
  });

  it('binds the signed state into the provider URL as the CSRF parameter', async () => {
    const { service, state } = makeService();
    const res = await service.startConnectClient(CLIENT_ID, 'INSTAGRAM');

    // The same state the service minted is the one the provider will echo
    // back, so the callback can verify it.
    const url = new URL(res.authorizeUrl);
    expect(url.searchParams.get('state')).toBe('state.signed.payload');
    expect(state.mint).toHaveBeenCalledTimes(1);
  });

  it('points redirect_uri at this API callback for the same platform', async () => {
    const { service } = makeService();
    const res = await service.startConnectClient(CLIENT_ID, 'INSTAGRAM');
    const url = new URL(res.authorizeUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/api/social-accounts/callback/INSTAGRAM',
    );
  });

  it('builds the Facebook authorize URL for the Facebook platform', async () => {
    const { service } = makeService();
    const res = await service.startConnectClient(CLIENT_ID, 'FACEBOOK');
    const url = new URL(res.authorizeUrl);
    expect(url.searchParams.get('client_id')).toBe('test-facebook-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/api/social-accounts/callback/FACEBOOK',
    );
  });

  it('refuses an unmanaged Client with a machine-readable CLIENT_NOT_MANAGED', async () => {
    const { service, state } = makeService({ relationship: null });
    const err = await service
      .startConnectClient(CLIENT_ID, 'INSTAGRAM')
      .catch((e: unknown) => e);

    // The authorization boundary itself is UNCHANGED: still a 403.
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as { getResponse: () => Record<string, unknown> }).getResponse();
    expect(body.code).toBe('CLIENT_NOT_MANAGED');
    expect(String(body.message)).toMatch(/Service Provider/);
    // No state is minted, so no handshake can start.
    expect(state.mint).not.toHaveBeenCalled();
  });

  it('never derives the organization from client input when unmanaged', async () => {
    const { service, prisma } = makeService({ relationship: null });
    await expect(service.startConnectClient(CLIENT_ID, 'YOUTUBE')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The relationship lookup is the ONLY source of tenant context.
    expect(prisma.clientAgencyRelationship.findFirst).toHaveBeenCalledWith({
      where: { clientId: CLIENT_ID, status: 'ACTIVE' },
      select: { organizationId: true },
    });
  });

  it('refuses when the Client has no owner binding', async () => {
    const { service, state } = makeService({ client: { ownerUserId: null } });
    const err = await service
      .startConnectClient(CLIENT_ID, 'FACEBOOK')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(state.mint).not.toHaveBeenCalled();
  });
});

/**
 * Callback-time authorization (no database required).
 *
 * The callback route is public, so `completeConnect` must re-prove from
 * PostgreSQL that the acting user is still authorized for the tenant in the
 * verified state. These tests pin the source-dependent proof:
 *   - AGENCY  -> active OrganizationMembership (unchanged, still enforced);
 *   - CLIENT  -> Client ownership + ACTIVE relationship.
 */
function makeCallbackService(over: {
  ownsClient?: boolean;
  relationshipActive?: boolean;
  isMember?: boolean;
} = {}) {
  const ownsClient = over.ownsClient === undefined ? true : over.ownsClient;
  const relationshipActive =
    over.relationshipActive === undefined ? true : over.relationshipActive;
  const isMember = over.isMember === undefined ? true : over.isMember;

  const prisma = {
    client: {
      findFirst: jest.fn(async () => (ownsClient ? { id: CLIENT_ID } : null)),
    },
    organizationMembership: {
      findFirst: jest.fn(async () => (isMember ? { id: 'mem-1' } : null)),
    },
  };
  const clientsService = {
    getClientForOrganization: jest.fn(async () =>
      relationshipActive ? { id: CLIENT_ID } : null,
    ),
  };
  const service = new SocialAccountsOAuthService(
    prisma as never,
    clientsService as never,
    { mint: jest.fn(), consume: jest.fn() } as never,
    {} as never,
  );
  return { service, prisma, clientsService };
}

const BASE_PAYLOAD = {
  sub: 'user-owner',
  organizationId: 'org-socialops',
  clientId: CLIENT_ID,
  platform: 'INSTAGRAM',
} as const;

/**
 * Invoke the callback authorization gate directly.
 *
 * The gate is the unit this change introduced; the code exchange and profile
 * fetch that follow it are connector-layer concerns covered by the
 * integration suite. Reaching them would require real platform credentials.
 */
function authorize(service: unknown, payload: unknown): Promise<void> {
  return (
    service as {
      assertActorAuthorizedForConnection: (p: unknown) => Promise<void>;
    }
  ).assertActorAuthorizedForConnection(payload);
}

describe('SocialAccountsOAuthService.completeConnect authorization', () => {
  it('accepts a self-registered Client owner holding an active SocialOps relationship', async () => {
    const { service, prisma, clientsService } = makeCallbackService();
    // The authorization gate is the unit under test; the exchange/profile
    // steps past it are covered by the integration suite.
    await expect(authorize(service, {
      ...BASE_PAYLOAD,
      source: 'CLIENT',
    })).resolves.toBeUndefined();

    // Ownership is re-read from the database, not from the state payload.
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, ownerUserId: 'user-owner' },
      select: { id: true },
    });
    // The tenant context still comes only from the ACTIVE relationship.
    expect(clientsService.getClientForOrganization).toHaveBeenCalledWith(
      CLIENT_ID,
      'org-socialops',
    );
  });

  it('rejects a CLIENT that is not owned by the acting user, with a uniform 403', async () => {
    const { service } = makeCallbackService({ ownsClient: false });
    const err = await service
      .completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        sub: 'attacker',
        source: 'CLIENT',
      } as never)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    // No existence leak: the message does not distinguish "not the owner"
    // from "no such Client".
    expect(String((err as Error).message)).not.toMatch(/not found/i);
  });

  it('rejects when the provider relationship is no longer ACTIVE', async () => {
    const { service } = makeCallbackService({ relationshipActive: false });
    const err = await service
      .completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        source: 'CLIENT',
      } as never)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('STILL requires an active OrganizationMembership for the AGENCY source', async () => {
    const { service, prisma } = makeCallbackService({ isMember: false });
    const err = await service
      .completeConnect('INSTAGRAM', 'auth-code', {
        ...BASE_PAYLOAD,
        sub: 'agency-operator',
        source: 'AGENCY',
      } as never)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    // The agency proof is membership-based, NOT ownership-based: the client
    // row is never consulted on this path.
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('accepts an active Agency operator completing a client-side connection', async () => {
    const { service, prisma } = makeCallbackService({ isMember: true });
    await expect(
      authorize(service, {
        ...BASE_PAYLOAD,
        sub: 'agency-operator',
        source: 'AGENCY',
      }),
    ).resolves.toBeUndefined();
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'agency-operator', organizationId: 'org-socialops' },
      select: { id: true },
    });
  });

  it('rejects a platform mismatch in the verified state', async () => {
    const { service } = makeCallbackService();
    const err = await service
      .completeConnect('FACEBOOK', 'auth-code', {
        ...BASE_PAYLOAD,
        source: 'CLIENT',
      } as never)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
  });
});
