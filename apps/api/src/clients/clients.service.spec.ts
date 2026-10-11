import { jest } from '@jest/globals';
import { ClientStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';
import type { CreateClientDto } from './dto/create-client.dto.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

function makeService() {
  const tx = {
    client: {
      create: jest.fn(),
      update: jest.fn(),
    },
    clientAgencyRelationship: { create: jest.fn() },
    clientEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    ),
  };
  return {
    service: new ClientsService(prisma as unknown as PrismaService),
    tx,
    prisma,
  };
}

describe('ClientsService.changeStatusWithAuditEvent', () => {
  it('updates the Client and creates its audit event in one transaction', async () => {
    const { service, tx, prisma } = makeService();
    asMock(tx.client.update).mockResolvedValue({ id: CLIENT_ID });

    await service.changeStatusWithAuditEvent(
      CLIENT_ID,
      { status: ClientStatus.ACTIVE },
      USER_ID,
      { from: ClientStatus.INACTIVE, to: ClientStatus.ACTIVE },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.clientEvent.create).toHaveBeenCalledWith({
      data: {
        clientId: CLIENT_ID,
        actorUserId: USER_ID,
        action: 'client.status.changed',
        details: { from: ClientStatus.INACTIVE, to: ClientStatus.ACTIVE },
      },
    });
    expect(asMock(tx.client.update).mock.invocationCallOrder[0]).toBeLessThan(
      asMock(tx.clientEvent.create).mock.invocationCallOrder[0],
    );
  });

  it('propagates audit-write failures so the transaction rolls back', async () => {
    const { service, tx } = makeService();
    const auditError = new Error('audit write failed');
    asMock(tx.client.update).mockResolvedValue({ id: CLIENT_ID });
    asMock(tx.clientEvent.create).mockRejectedValue(auditError);

    await expect(
      service.changeStatusWithAuditEvent(
        CLIENT_ID,
        { status: ClientStatus.ACTIVE },
        USER_ID,
        { from: ClientStatus.INACTIVE, to: ClientStatus.ACTIVE },
      ),
    ).rejects.toBe(auditError);
  });
});

describe('ClientsService.createClientForOrganization', () => {
  const dto: CreateClientDto = {
    type: 'BUSINESS',
    name: 'Test client',
    directEmail: 'client@example.com',
    directPhone: '1234567890',
  };

  it('creates the Client, relationship, and audit event in one transaction', async () => {
    const { service, tx, prisma } = makeService();
    asMock(tx.client.create).mockResolvedValue({
      id: CLIENT_ID,
      type: dto.type,
    });

    await service.createClientForOrganization(dto, USER_ID, ORGANIZATION_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.clientAgencyRelationship.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: CLIENT_ID,
        organizationId: ORGANIZATION_ID,
        status: 'ACTIVE',
      }),
    });
    expect(tx.clientEvent.create).toHaveBeenCalledWith({
      data: {
        clientId: CLIENT_ID,
        actorUserId: USER_ID,
        action: 'client.created',
        details: {
          source: 'AGENCY',
          type: dto.type,
          organizationId: ORGANIZATION_ID,
        },
      },
    });
    expect(asMock(tx.client.create).mock.invocationCallOrder[0]).toBeLessThan(
      asMock(tx.clientAgencyRelationship.create).mock.invocationCallOrder[0],
    );
    expect(
      asMock(tx.clientAgencyRelationship.create).mock.invocationCallOrder[0],
    ).toBeLessThan(asMock(tx.clientEvent.create).mock.invocationCallOrder[0]);
  });

  it('propagates relationship failures so no partial Client is committed', async () => {
    const { service, tx } = makeService();
    const relationshipError = new Error('relationship write failed');
    asMock(tx.client.create).mockResolvedValue({
      id: CLIENT_ID,
      type: dto.type,
    });
    asMock(tx.clientAgencyRelationship.create).mockRejectedValue(
      relationshipError,
    );

    await expect(
      service.createClientForOrganization(dto, USER_ID, ORGANIZATION_ID),
    ).rejects.toBe(relationshipError);
    expect(tx.clientEvent.create).not.toHaveBeenCalled();
  });
});
