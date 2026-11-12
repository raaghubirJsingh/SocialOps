import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { FreelancerProfileCompleteGuard } from './freelancer-profile-complete.guard.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FreelancerProfileCompleteGuard', () => {
  it('allows a completed Freelancer profile', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          accountType: 'FREELANCER',
          freelancerProfile: {
            profileCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
          },
        })),
      },
    };
    const guard = new FreelancerProfileCompleteGuard(prisma as never);

    const result = await guard.canActivate(
      makeContext({ user: { sub: 'user-1' } }),
    );

    expect(result).toBe(true);
  });

  it.each(['CLIENT', 'SERVICE_PROVIDER', null])(
    'denies a %s account even when its profile is complete',
    async (accountType) => {
      const prisma = {
        user: {
          findUnique: jest.fn(async () => ({
            accountType,
            freelancerProfile: {
              profileCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
            },
          })),
        },
      };
      const guard = new FreelancerProfileCompleteGuard(prisma as never);

      await expect(
        guard.canActivate(makeContext({ user: { sub: 'user-1' } })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('throws UnauthorizedException when no JWT user is present', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const guard = new FreelancerProfileCompleteGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws ForbiddenException when the user does not exist', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => null),
      },
    };
    const guard = new FreelancerProfileCompleteGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ user: { sub: 'user-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when a FreelancerProfile is missing', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          accountType: 'FREELANCER',
          freelancerProfile: null,
        })),
      },
    };
    const guard = new FreelancerProfileCompleteGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ user: { sub: 'user-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when the profile is incomplete', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          accountType: 'FREELANCER',
          freelancerProfile: { profileCompletedAt: null },
        })),
      },
    };
    const guard = new FreelancerProfileCompleteGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ user: { sub: 'user-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses the JWT subject to look up the account', async () => {
    const findUnique = jest.fn(async () => ({
      accountType: 'FREELANCER',
      freelancerProfile: {
        profileCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    }));
    const guard = new FreelancerProfileCompleteGuard({
      user: { findUnique },
    } as never);

    await guard.canActivate(
      makeContext({
        user: { sub: 'jwt-user' },
        body: { userId: 'body-user', profileId: 'client-profile' },
      }),
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'jwt-user' },
      select: {
        accountType: true,
        freelancerProfile: { select: { profileCompletedAt: true } },
      },
    });
  });
});
