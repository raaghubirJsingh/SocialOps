import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationRoleService } from './organization-role.service.js';

const ACTOR_USER_ID = 'actor-user-1111';
const TARGET_USER_ID = 'target-user-2222';
const OTHER_USER_ID = 'other-user-3333';
const ORG_ID = 'org-1111';
const MEMBERSHIP_ID = 'membership-1111';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

interface MockTx {
  $queryRaw: jest.Mock;
  organizationMembership: {
    update: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  adminAuditEvent: {
    create: jest.Mock;
  };
}

function makePrismaMock(): {
  $transaction: ReturnType<typeof jest.fn>;
  organizationMembership: {
    findUnique: ReturnType<typeof jest.fn>;
    count: ReturnType<typeof jest.fn>;
    findMany: ReturnType<typeof jest.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof jest.fn>;
  };
  adminAuditEvent: {
    create: ReturnType<typeof jest.fn>;
  };
} {
  const tx = {
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    organizationMembership: {
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    adminAuditEvent: {
      create: jest.fn(),
    },
  };

  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) =>
      callback(tx),
    ),
    organizationMembership: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    adminAuditEvent: {
      create: jest.fn(),
    },
  } as any as ReturnType<typeof makePrismaMock>;
}

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
  return {
    service: new OrganizationRoleService(prisma as unknown as PrismaService),
    prisma,
  };
}

function baseMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP_ID,
    userId: TARGET_USER_ID,
    organizationId: ORG_ID,
    role: OrganizationRole.MEMBER,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('OrganizationRoleService.updateRoleByMembershipId', () => {
  describe('security checks', () => {
    it('prevents self-escalation (actor cannot change own role)', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(
        baseMembership({
          userId: ACTOR_USER_ID, // Same as actor
          role: OrganizationRole.MEMBER,
        }),
      );

      asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });

      const { service } = makeService(prisma);

      await expect(
        service.updateRoleByMembershipId(ACTOR_USER_ID, {
          membershipId: MEMBERSHIP_ID,
          role: OrganizationRole.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.organizationMembership.findUnique).toHaveBeenCalled();
    });

    it('prevents assigning OWNER role to others', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(
        baseMembership({ role: OrganizationRole.MEMBER }),
      );

      asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });

      const { service } = makeService(prisma);

      await expect(
        service.updateRoleByMembershipId(ACTOR_USER_ID, {
          membershipId: MEMBERSHIP_ID,
          role: OrganizationRole.OWNER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents demoting the last OWNER', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(
        baseMembership({
          userId: TARGET_USER_ID,
          role: OrganizationRole.OWNER,
        }),
      );

      asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });
      asMock(prisma.organizationMembership.count).mockResolvedValue(1); // Only one OWNER

      const { service } = makeService(prisma);

      await expect(
        service.updateRoleByMembershipId(ACTOR_USER_ID, {
          membershipId: MEMBERSHIP_ID,
          role: OrganizationRole.ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows demoting an OWNER when other OWNERs exist', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(
        baseMembership({
          userId: TARGET_USER_ID,
          role: OrganizationRole.OWNER,
        }),
      );

      asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });
      asMock(prisma.organizationMembership.count).mockResolvedValue(2); // Two OWNERs
      asMock(prisma.$transaction).mockImplementation(async (callback) =>
        callback({} as MockTx),
      );

      const { service } = makeService(prisma);

      await expect(
        service.updateRoleByMembershipId(ACTOR_USER_ID, {
          membershipId: MEMBERSHIP_ID,
          role: OrganizationRole.ADMIN,
        }),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException for non-existent membership', async () => {
      const prisma = makePrismaMock();
      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(null);

      const { service } = makeService(prisma);

      await expect(
        service.updateRoleByMembershipId(ACTOR_USER_ID, {
          membershipId: 'non-existent-membership',
          role: OrganizationRole.ADMIN,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('successful role updates', () => {
    it('updates role and creates audit event in transaction', async () => {
      const prisma = makePrismaMock();
      const mockTx: MockTx = {
        $queryRaw: jest.fn(),
        organizationMembership: {
          update: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        adminAuditEvent: {
          create: jest.fn(),
        },
      };

      asMock(prisma.$transaction).mockImplementation(
        async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx),
      );

      asMock(prisma.organizationMembership.findUnique).mockResolvedValue(
        baseMembership({
          userId: TARGET_USER_ID,
          role: OrganizationRole.MEMBER,
        }),
      );

      asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });
      asMock(prisma.organizationMembership.count).mockResolvedValue(3);

      asMock(mockTx.organizationMembership.update).mockResolvedValue({
        id: MEMBERSHIP_ID,
        userId: TARGET_USER_ID,
        organizationId: ORG_ID,
        role: OrganizationRole.ADMIN,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      });

      asMock(mockTx.adminAuditEvent.create).mockResolvedValue({
        id: 'audit-1',
      });

      const { service } = makeService(prisma);

      const result = await service.updateRoleByMembershipId(ACTOR_USER_ID, {
        membershipId: MEMBERSHIP_ID,
        role: OrganizationRole.ADMIN,
      });

      expect(result.previousRole).toBe(OrganizationRole.MEMBER);
      expect(result.newRole).toBe(OrganizationRole.ADMIN);
      expect(result.userId).toBe(TARGET_USER_ID);
      expect(result.organizationId).toBe(ORG_ID);

      expect(mockTx.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEMBERSHIP_ID },
          data: { role: OrganizationRole.ADMIN },
        }),
      );

      expect(mockTx.adminAuditEvent.create).toHaveBeenCalledWith({
        data: {
          actorUserId: ACTOR_USER_ID,
          action: 'organization.role_changed',
          targetType: 'organization_membership',
          targetId: MEMBERSHIP_ID,
          details: {
            organizationId: ORG_ID,
            userId: TARGET_USER_ID,
            previousRole: OrganizationRole.MEMBER,
            newRole: OrganizationRole.ADMIN,
          },
        },
      });
    });
  });
});

describe('OrganizationRoleService.updateRoleByMemberAndOrg', () => {
  it('validates route params match body', async () => {
    const prisma = makePrismaMock();
    const { service } = makeService(prisma);

    await expect(
      service.updateRoleByMemberAndOrg(ACTOR_USER_ID, {
        userId: 'different-user',
        organizationId: ORG_ID,
        role: OrganizationRole.ADMIN,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('delegates to updateRoleByMembershipId when params match', async () => {
    const prisma = makePrismaMock();

    asMock(prisma.organizationMembership.findUnique).mockResolvedValue({
      id: MEMBERSHIP_ID,
      userId: TARGET_USER_ID,
      organizationId: ORG_ID,
      role: OrganizationRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: TARGET_USER_ID },
    });

    asMock(prisma.organization.findUnique).mockResolvedValue({ id: ORG_ID });
    asMock(prisma.organizationMembership.count).mockResolvedValue(3);

    asMock(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        organizationMembership: { update: jest.fn() },
        adminAuditEvent: { create: jest.fn() },
      } as any),
    );

    const { service } = makeService(prisma);

    const result = await service.updateRoleByMemberAndOrg(ACTOR_USER_ID, {
      userId: TARGET_USER_ID,
      organizationId: ORG_ID,
      role: OrganizationRole.ADMIN,
    });

    expect(result).toBeDefined();
    expect(result.userId).toBe(TARGET_USER_ID);
    expect(result.organizationId).toBe(ORG_ID);
  });
});

describe('OrganizationRoleService.getRole', () => {
  it('returns membership info when membership exists', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.organizationMembership.findUnique).mockResolvedValue({
      id: MEMBERSHIP_ID,
      role: OrganizationRole.ADMIN,
    });

    const { service } = makeService(prisma);

    const result = await service.getRole(TARGET_USER_ID, ORG_ID);

    expect(result).toEqual({
      membershipId: MEMBERSHIP_ID,
      role: OrganizationRole.ADMIN,
    });
  });

  it('returns null when membership does not exist', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.organizationMembership.findUnique).mockResolvedValue(null);

    const { service } = makeService(prisma);

    const result = await service.getRole(TARGET_USER_ID, ORG_ID);

    expect(result).toBeNull();
  });
});

describe('OrganizationRoleService.listMemberships', () => {
  it('lists all memberships for an organization', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.organizationMembership.findMany).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        role: OrganizationRole.OWNER,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'm2',
        userId: 'u2',
        role: OrganizationRole.ADMIN,
        createdAt: new Date('2024-01-02'),
      },
    ]);

    asMock(prisma.organizationMembership.count).mockResolvedValue(2);

    const { service } = makeService(prisma);

    const result = await service.listMemberships(ORG_ID);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].userId).toBe('u1');
    expect(result.data[0].role).toBe(OrganizationRole.OWNER);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.total).toBe(2);
  });

  it('filters by role when provided', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.organizationMembership.findMany).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        role: OrganizationRole.ADMIN,
        createdAt: new Date('2024-01-01'),
      },
    ]);

    asMock(prisma.organizationMembership.count).mockResolvedValue(1);

    const { service } = makeService(prisma);

    await service.listMemberships(ORG_ID, { role: OrganizationRole.ADMIN });

    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_ID,
          role: OrganizationRole.ADMIN,
        },
      }),
    );
  });

  it('supports pagination', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.organizationMembership.findMany).mockResolvedValue([
      {
        id: 'm2',
        userId: 'u2',
        role: OrganizationRole.MEMBER,
        createdAt: new Date(),
      },
    ]);

    asMock(prisma.organizationMembership.count).mockResolvedValue(2);

    const { service } = makeService(prisma);

    const result = await service.listMemberships(ORG_ID, {
      cursor: 'm1',
      limit: 10,
    });

    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        cursor: { id: 'm1' },
        take: 11,
      }),
    );

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPrevPage).toBe(true);
  });
});
