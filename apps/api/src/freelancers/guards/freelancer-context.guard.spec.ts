import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { FreelancerContextGuard } from './freelancer-context.guard.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FreelancerContextGuard', () => {
  it('allows a request when a FreelancerProfile exists', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          accountType: 'FREELANCER',
          freelancerProfile: { id: 'profile-1', userId: 'user-1' },
        })),
      },
    };
    const guard = new FreelancerContextGuard(prisma as never);

    const result = await guard.canActivate(
      makeContext({ user: { sub: 'user-1' } }),
    );

    expect(result).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        accountType: true,
        freelancerProfile: { select: { id: true, userId: true } },
      },
    });
  });

  it('throws UnauthorizedException when no JWT user is present', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const guard = new FreelancerContextGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['CLIENT', 'SERVICE_PROVIDER', null])(
    'throws ForbiddenException for a %s account even if it has a profile',
    async (accountType) => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          accountType,
          freelancerProfile: { id: 'profile-1', userId: 'user-1' },
        })),
      },
    };
    const guard = new FreelancerContextGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ user: { sub: 'user-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
