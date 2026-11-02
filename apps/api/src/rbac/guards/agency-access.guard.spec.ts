import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { AgencyAccessGuard } from './agency-access.guard.js';

function makeGuard(organization: Record<string, unknown> | null) {
  const prisma = {
    organization: {
      findUnique: jest.fn(async () => organization),
    },
  };
  return { guard: new AgencyAccessGuard(prisma as never), prisma };
}

function makeContext(organization: Record<string, unknown> | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ organization }),
    }),
  } as any;
}

describe('AgencyAccessGuard', () => {
  it('allows a VERIFIED AGENCY organization from trusted database data', async () => {
    const { guard, prisma } = makeGuard({
      kind: 'AGENCY',
      verificationStatus: 'VERIFIED',
    });
    await expect(
      guard.canActivate(makeContext({ id: 'org-1', role: 'ADMIN' })),
    ).resolves.toBe(true);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { kind: true, verificationStatus: true },
    });
  });

  it.each(['PENDING', 'REJECTED'])('denies a %s AGENCY organization', async (verificationStatus) => {
    const { guard } = makeGuard({ kind: 'AGENCY', verificationStatus });
    await expect(
      guard.canActivate(makeContext({ id: 'org-1', role: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['SOCIALOPS', 'NEWS_ORGANIZATION'])('denies a %s organization', async (kind) => {
    const { guard } = makeGuard({ kind, verificationStatus: 'VERIFIED' });
    await expect(
      guard.canActivate(makeContext({ id: 'org-1', role: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when no organization context is attached', async () => {
    const { guard, prisma } = makeGuard(null);
    await expect(
      guard.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
