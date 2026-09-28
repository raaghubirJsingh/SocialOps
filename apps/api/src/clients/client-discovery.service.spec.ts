import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { Organization } from '@prisma/client';

import { ClientDiscoveryService } from './client-discovery.service.js';

const ORG_ID = '22222222-2222-4222-8222-222222222222';

function org(over: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
    name: 'Some Agency',
    slug: 'some-agency',
    isActive: true,
    kind: 'AGENCY',
    createdAt: new Date(),
    updatedAt: new Date(),
    discoveryOptIn: true,
    discoveryApprovedAt: new Date(),
    discoveryApprovedByUserId: null,
    ...over,
  } as Organization;
}

function makeService(current: Organization | null = org()) {
  const prisma = {
    organization: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => current),
      update: jest.fn(async () => org()),
    },
  };
  return { service: new ClientDiscoveryService(prisma as never), prisma };
}

describe('ClientDiscoveryService', () => {
  it('restricts the catalog to external Agencies by kind', async () => {
    const { service, prisma } = makeService();
    await service.listDiscoverableAgencies();
    // The filter - not a mutable discoveryOptIn flag - is what guarantees the
    // platform-owned SOCIALOPS Organization is never offered as a choice.
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: 'AGENCY' }),
      }),
    );
  });

  it('refuses to publish the SOCIALOPS organization through opt-in', async () => {
    const { service, prisma } = makeService(org({ kind: 'SOCIALOPS' }));
    await expect(service.optIn(ORG_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('refuses to publish the SOCIALOPS organization through admin approval', async () => {
    const { service, prisma } = makeService(org({ kind: 'SOCIALOPS' }));
    await expect(service.approve(ORG_ID, 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('still lets a real Agency opt in and be approved', async () => {
    const { service, prisma } = makeService();
    await expect(service.optIn(ORG_ID)).resolves.toBeDefined();
    await expect(service.approve(ORG_ID, 'admin-1')).resolves.toBeDefined();
    expect(prisma.organization.update).toHaveBeenCalledTimes(2);
  });

  it('treats the SOCIALOPS organization as not discoverable even if flags were set', async () => {
    const { service } = makeService(
      org({ kind: 'SOCIALOPS', discoveryOptIn: true, discoveryApprovedAt: new Date() }),
    );
    // Defence in depth: a stray flag write cannot publish the provider.
    await expect(service.assertDiscoverable(ORG_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a discoverable Agency through the fail-closed gate', async () => {
    const { service } = makeService();
    await expect(service.assertDiscoverable(ORG_ID)).resolves.toBeDefined();
  });
});
