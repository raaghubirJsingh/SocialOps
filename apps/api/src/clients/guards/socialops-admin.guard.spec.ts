import { ExecutionContext } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../prisma/prisma.service.js';
import { SocialOpsAdminGuard } from './socialops-admin.guard.js';

const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const PLAIN_ID = '66666666-6666-4666-8666-666666666666';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeRequest(sub: string | undefined) {
  return {
    user: sub
      ? { sub, email: 'user@example.com', accountType: null }
      : undefined,
  };
}

type MockFn = ReturnType<typeof jest.fn>;
const asMock = (fn: unknown): MockFn => fn as MockFn;

function makeGuard(dbUser: { isSocialOpsAdmin: boolean } | null) {
  const findUnique = jest.fn();
  asMock(findUnique).mockResolvedValue(dbUser);
  const prisma = { user: { findUnique } };
  const guard = new SocialOpsAdminGuard(prisma as unknown as PrismaService);
  return { guard, findUnique: asMock(findUnique) };
}

describe('SocialOpsAdminGuard (user-level global authority, Option A)', () => {
  it('allows a user whose DB flag isSocialOpsAdmin is true', async () => {
    const { guard, findUnique } = makeGuard({ isSocialOpsAdmin: true });

    await expect(
      guard.canActivate(makeContext(makeRequest(ADMIN_ID))),
    ).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADMIN_ID } }),
    );
  });

  it('denies when the DB flag is false', async () => {
    const { guard } = makeGuard({ isSocialOpsAdmin: false });

    await expect(
      guard.canActivate(makeContext(makeRequest(PLAIN_ID))),
    ).rejects.toThrow(/SOCIALOPS_ADMIN authority required/i);
  });

  it('is separate from organization roles: an org OWNER without the flag is denied', async () => {
    // The organization-scoped OWNER/ADMIN/MEMBER/VIEWER roles never imply
    // SOCIALOPS_ADMIN. The guard reads only the user-level DB flag.
    const { guard } = makeGuard({ isSocialOpsAdmin: false });
    const request = {
      ...makeRequest(PLAIN_ID),
      organizationRole: 'OWNER',
    };

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toThrow(/SOCIALOPS_ADMIN authority required/i);
  });

  it('denies when the user record is missing (fail closed)', async () => {
    const { guard } = makeGuard(null);

    await expect(
      guard.canActivate(makeContext(makeRequest(PLAIN_ID))),
    ).rejects.toThrow(/SOCIALOPS_ADMIN authority required/i);
  });

  it('denies an unauthenticated request', async () => {
    const { guard } = makeGuard({ isSocialOpsAdmin: true });

    await expect(
      guard.canActivate(makeContext(makeRequest(undefined))),
    ).rejects.toThrow(/Authentication required/i);
  });
});