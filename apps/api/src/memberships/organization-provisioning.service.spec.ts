import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';
import { OrganizationProvisioningService } from './organization-provisioning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

function makePrismaMock() {
  const prisma = {
    user: { findUnique: jest.fn() },
    organization: { create: jest.fn() },
    organizationMembership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  (prisma.$transaction as ReturnType<typeof jest.fn>).mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(prisma),
  );
  return prisma;
}

function makeService() {
  const prisma = makePrismaMock();
  const service = new OrganizationProvisioningService(
    prisma as unknown as PrismaService,
  );
  return { service, prisma };
}

describe('OrganizationProvisioningService', () => {
  it('is a no-op when the user is not a Service Provider', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      fullName: 'Indie',
      displayName: 'Indie',
      accountType: 'INDIVIDUAL_BUSINESS',
    });

    await service.ensureForServiceProvider('user-1');

    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the user already has a membership', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'sp@example.com',
      fullName: 'Agency Owner',
      displayName: 'Agency Owner',
      accountType: 'SERVICE_PROVIDER',
    });
    (prisma.organizationMembership.findFirst as ReturnType<typeof jest.fn>).mockResolvedValue(
      { id: 'mem-1' },
    );

    await service.ensureForServiceProvider('user-1');

    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.organizationMembership.create).not.toHaveBeenCalled();
  });

  it('creates an Organization and OWNER membership for a Service Provider', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      email: 'sp@example.com',
      fullName: 'Agency Owner',
      displayName: 'Agency Owner',
      accountType: 'SERVICE_PROVIDER',
    });
    (prisma.organizationMembership.findFirst as ReturnType<typeof jest.fn>).mockResolvedValue(
      null,
    );
    (prisma.organization.create as ReturnType<typeof jest.fn>).mockResolvedValue({
      id: 'org-1',
    });
    (prisma.organizationMembership.create as ReturnType<typeof jest.fn>).mockResolvedValue(
      { id: 'mem-1' },
    );

    await service.ensureForServiceProvider(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Agency Owner's organization",
        slug: expect.stringMatching(/^agency-owner-/),
      },
    });
    expect(prisma.organizationMembership.create).toHaveBeenCalledWith({
      data: {
        userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        organizationId: 'org-1',
        role: 'OWNER',
      },
    });
  });

  it('treats a unique-constraint race as success when a membership now exists', async () => {
    const { service, prisma } = makeService();
    (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'sp@example.com',
      fullName: 'Agency Owner',
      displayName: 'Agency Owner',
      accountType: 'SERVICE_PROVIDER',
    });
    (prisma.organizationMembership.findFirst as ReturnType<typeof jest.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'mem-1' });
    (prisma.$transaction as ReturnType<typeof jest.fn>).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.ensureForServiceProvider('user-1')).resolves.toBeUndefined();
  });
});
