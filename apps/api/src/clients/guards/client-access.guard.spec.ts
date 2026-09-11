import { ExecutionContext } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Client } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';
import { ClientAccessGuard } from './client-access.guard.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_ID = '44444444-4444-4444-8444-444444444444';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    ownerUserId: OWNER_ID,
    onboardingStatus: 'ACTIVE',
    status: 'ACTIVE',
    ...overrides,
  } as Client;
}

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: { 'x-client-id': CLIENT_ID },
    user: { sub: OWNER_ID, email: 'owner@example.com', accountType: null },
    ...overrides,
  };
}

type MockFn = ReturnType<typeof jest.fn>;
const asMock = (fn: unknown): MockFn => fn as MockFn;

function makeGuard(clientRecord: Client | null) {
  const findUnique = jest.fn();
  asMock(findUnique).mockResolvedValue(clientRecord);
  const prisma = { client: { findUnique } };
  const guard = new ClientAccessGuard(prisma as unknown as PrismaService);
  return { guard, findUnique: asMock(findUnique) };
}

describe('ClientAccessGuard (locked: binding + onboarding ACTIVE)', () => {
  it('allows the bound owner of an onboarding-ACTIVE client and attaches it', async () => {
    const client = makeClient();
    const { guard } = makeGuard(client);
    const request = makeRequest();

    await expect(
      guard.canActivate(makeContext(request)),
    ).resolves.toBe(true);
    expect((request as { client?: Client }).client).toBe(client);
  });

  it('denies a PENDING client even when ClientStatus is ACTIVE', async () => {
    const { guard } = makeGuard(
      makeClient({ onboardingStatus: 'PENDING' }),
    );

    await expect(
      guard.canActivate(makeContext(makeRequest())),
    ).rejects.toThrow(/onboarding is pending/i);
  });

  it('denies a non-owner even for an onboarding-ACTIVE client', async () => {
    const { guard } = makeGuard(makeClient());

    await expect(
      guard.canActivate(
        makeContext(makeRequest({ user: { sub: STRANGER_ID } })),
      ),
    ).rejects.toThrow(/Client access denied/i);
  });

  it('denies when no client record exists (fail closed, no leak)', async () => {
    const { guard } = makeGuard(null);

    await expect(
      guard.canActivate(makeContext(makeRequest())),
    ).rejects.toThrow(/Client access denied/i);
  });

  it('denies an unauthenticated request', async () => {
    const { guard } = makeGuard(makeClient());

    await expect(
      guard.canActivate(makeContext(makeRequest({ user: undefined }))),
    ).rejects.toThrow(/Authentication required/i);
  });

  it('requires the X-Client-Id header', async () => {
    const { guard } = makeGuard(makeClient());

    await expect(
      guard.canActivate(makeContext(makeRequest({ headers: {} }))),
    ).rejects.toThrow(/X-Client-Id header is required/i);
  });
});