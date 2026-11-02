import { jest } from '@jest/globals';
import { InternalServerErrorException } from '@nestjs/common';

import {
  isProviderAttachRace,
  isProviderProvisioningRequired,
  ProviderAttachRaceError,
  ProviderProvisioningRequiredError,
  SocialOpsProviderService,
} from './social-ops-provider.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

/** A PostgreSQL unique-constraint violation, as Prisma reports it. */
function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

/**
 * Decision 012 - platform Service Provider attachment.
 *
 * These pin the properties that keep this safe:
 *   1. singleton provider (no duplicate SOCIALOPS Organization);
 *   2. idempotency (repeat activation never duplicates a relationship);
 *   3. no silent reassignment (an external-Agency-managed Client is never
 *      moved to SocialOps);
 *   4. a slug owned by another Organization never blocks activation, and that
 *      Organization is never reused or renamed;
 *   5. a P2002 NEVER triggers a recovery query on an aborted transaction.
 *
 * `transaction` intentionally has NO `$transaction` method: that is how the
 * service recognises a caller-owned transaction client (which PostgreSQL
 * aborts on the first failed statement) as opposed to a standalone client.
 */
function makeHarness() {
  const organization = {
    findFirst: jest.fn(
      async (): Promise<{ id: string } | null> => null,
    ),
    findMany: jest.fn(async (): Promise<{ slug: string }[]> => []),
    create: jest.fn(async (): Promise<{ id: string }> => ({
      id: 'org-socialops',
    })),
    update: jest.fn(async () => ({ id: 'org-agency' })),
  };
  const relationship = {
    findFirst: jest.fn(async (): Promise<{
      id: string;
      organizationId: string;
    } | null> => null),
    create: jest.fn(async (): Promise<{ id: string; organizationId: string }> => ({
      id: 'rel-1',
      organizationId: 'org-socialops',
    })),
  };
  const transaction = { organization, clientAgencyRelationship: relationship };
  const prisma = {
    organization,
    clientAgencyRelationship: relationship,
    $transaction: jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const service = new SocialOpsProviderService(prisma as never);
  return { service, prisma, organization, relationship, transaction };
}

describe('SocialOpsProviderService.ensureProviderOrganization', () => {
  it('reuses the existing SOCIALOPS organization instead of creating a second one', async () => {
    const { service, organization, prisma, transaction } = makeHarness();
    organization.findFirst.mockResolvedValue({ id: 'org-existing' });

    await expect(
      service.ensureProviderOrganization(transaction as never),
    ).resolves.toEqual({ id: 'org-existing' });
    // resolve-only path: no row is created, so the provider stays a singleton.
    expect(organization.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never INSERTs on a caller-owned transaction, because a P2002 aborts it', async () => {
    const { service, organization, relationship, transaction } = makeHarness();

    const err = await service
      .ensureProviderOrganization(transaction as never)
      .catch((e: unknown) => e);

    expect(isProviderProvisioningRequired(err)).toBe(true);
    expect(err).toBeInstanceOf(ProviderProvisioningRequiredError);
    // No insert was attempted, so nothing could have aborted the caller's
    // transaction - the original defect.
    expect(organization.create).not.toHaveBeenCalled();
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('provisions through the standalone client when the provider is missing', async () => {
    const { service, organization, prisma } = makeHarness();

    await expect(service.ensureProviderOrganization(prisma as never)).resolves.toEqual(
      { id: 'org-socialops' },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(organization.create).toHaveBeenCalledTimes(1);
  });
});

describe('SocialOpsProviderService.provisionProviderOrganization', () => {
  it('creates the provider with the preferred slug, kind SOCIALOPS, and NOT discoverable', async () => {
    const { service, organization } = makeHarness();

    await expect(service.provisionProviderOrganization()).resolves.toEqual({
      id: 'org-socialops',
    });
    expect(organization.create).toHaveBeenCalledWith({
      data: {
        name: 'SocialOps',
        slug: 'socialops',
        kind: 'SOCIALOPS',
        // The platform provider is attached automatically, so it must never
        // appear in the external Agency discovery catalog.
        discoveryOptIn: false,
        discoveryApprovedAt: null,
      },
      select: { id: true },
    });
  });

  it('moves to an alternate slug when an external Agency owns "socialops"', async () => {
    const { service, organization } = makeHarness();
    organization.findMany.mockResolvedValue([{ slug: 'socialops' }]);

    await expect(service.provisionProviderOrganization()).resolves.toEqual({
      id: 'org-socialops',
    });
    expect(organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'socialops-provider',
          kind: 'SOCIALOPS',
        }),
      }),
    );
    // The Agency that holds the preferred slug is NEVER reused or renamed:
    // doing so would repoint the platform provider at a third-party tenant.
    expect(organization.update).not.toHaveBeenCalled();
  });

  it('keeps walking the candidate list when several reserved slugs are taken', async () => {
    const { service, organization } = makeHarness();
    organization.findMany.mockResolvedValue([
      { slug: 'socialops' },
      { slug: 'socialops-provider' },
    ]);

    await service.provisionProviderOrganization();

    expect(organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'socialops-service-provider' }),
      }),
    );
  });

  it('retries on a FRESH transaction when a concurrent provisioning won the race', async () => {
    const { service, organization, prisma } = makeHarness();
    organization.findFirst
      .mockResolvedValueOnce(null) // attempt 1: nothing provisioned yet
      .mockResolvedValueOnce({ id: 'org-winner' }); // attempt 2: concurrent winner
    organization.create.mockRejectedValueOnce(uniqueViolation());

    await expect(service.provisionProviderOrganization()).resolves.toEqual({
      id: 'org-winner',
    });
    // Exactly ONE insert was attempted, and each attempt ran in its OWN
    // transaction: the aborted one is never reused.
    expect(organization.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up with a controlled error instead of retrying forever', async () => {
    const { service, organization, prisma } = makeHarness();
    organization.create.mockRejectedValue(uniqueViolation());

    const err = await service
      .provisionProviderOrganization()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InternalServerErrorException);
    const body = (
      err as { getResponse: () => Record<string, unknown> }
    ).getResponse();
    expect(body.code).toBe('SERVICE_PROVIDER_UNAVAILABLE');
    // The raw database error never reaches the caller.
    expect(JSON.stringify(body)).not.toMatch(/P2002|Unique constraint/);
    expect(organization.create).toHaveBeenCalledTimes(5);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('fails with a controlled error when every reserved slug is taken', async () => {
    const { service, organization } = makeHarness();
    organization.findMany.mockResolvedValue([
      { slug: 'socialops' },
      { slug: 'socialops-provider' },
      { slug: 'socialops-service-provider' },
      { slug: 'socialops-platform' },
    ]);

    const err = await service
      .provisionProviderOrganization()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect(
      (err as { getResponse: () => Record<string, unknown> }).getResponse().code,
    ).toBe('SERVICE_PROVIDER_UNAVAILABLE');
    expect(organization.create).not.toHaveBeenCalled();
  });
});


describe('SocialOpsProviderService.attachIfUnmanaged', () => {
  it('is idempotent: an existing ACTIVE relationship is returned untouched', async () => {
    const { service, organization, relationship, transaction } = makeHarness();
    relationship.findFirst.mockResolvedValue({
      id: 'rel-existing',
      organizationId: 'org-existing',
    });

    await expect(
      service.attachIfUnmanaged(transaction as never, CLIENT_ID),
    ).resolves.toBe('org-existing');
    // Repeat activation must not create a second relationship or a provider.
    expect(relationship.create).not.toHaveBeenCalled();
    expect(organization.create).not.toHaveBeenCalled();
  });

  it('never silently reassigns an external-Agency-managed Client to SocialOps', async () => {
    const { service, relationship, transaction } = makeHarness();
    relationship.findFirst.mockResolvedValue({
      id: 'rel-agency',
      organizationId: 'org-external-agency',
    });

    await expect(
      service.attachIfUnmanaged(transaction as never, CLIENT_ID),
    ).resolves.toBe('org-external-agency');
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('writes no relationship when the provider still has to be provisioned', async () => {
    const { service, relationship, transaction } = makeHarness();

    const err = await service
      .attachIfUnmanaged(transaction as never, CLIENT_ID)
      .catch((e: unknown) => e);

    expect(isProviderProvisioningRequired(err)).toBe(true);
    // Nothing partial was written: the relationship insert never ran.
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('attaches to an unmanaged Client once the provider exists', async () => {
    const { service, organization, relationship, transaction } = makeHarness();
    organization.findFirst.mockResolvedValue({ id: 'org-socialops' });

    await expect(
      service.attachIfUnmanaged(transaction as never, CLIENT_ID),
    ).resolves.toBe('org-socialops');
    expect(relationship.create).toHaveBeenCalledWith({
      data: {
        clientId: CLIENT_ID,
        organizationId: 'org-socialops',
        status: 'ACTIVE',
        initiatedBy: 'PLATFORM',
        startedAt: expect.any(Date),
      },
      select: { id: true, organizationId: true },
    });
  });

  it('never queries an aborted transaction after the relationship insert fails', async () => {
    const { service, organization, relationship, transaction } = makeHarness();
    organization.findFirst.mockResolvedValue({ id: 'org-socialops' });
    relationship.create.mockRejectedValueOnce(uniqueViolation());

    const err = await service
      .attachIfUnmanaged(transaction as never, CLIENT_ID)
      .catch((e: unknown) => e);

    expect(isProviderAttachRace(err)).toBe(true);
    expect(err).toBeInstanceOf(ProviderAttachRaceError);
    // Exactly ONE read - the pre-read. The recovery read belongs to the
    // CALLER, in a fresh transaction, because this one is aborted (25P02).
    expect(relationship.findFirst).toHaveBeenCalledTimes(1);
  });

  it('adopts the winning relationship when the client is standalone', async () => {
    const { service, organization, relationship, prisma } = makeHarness();
    organization.findFirst.mockResolvedValue({ id: 'org-socialops' });
    relationship.findFirst
      .mockResolvedValueOnce(null) // nothing attached yet
      .mockResolvedValueOnce({ id: 'rel-winner', organizationId: 'org-winner' });
    relationship.create.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.attachIfUnmanaged(prisma as never, CLIENT_ID),
    ).resolves.toBe('org-winner');
    // Exactly one create was attempted; the loser adopted the winner's row
    // rather than failing the activation or writing a second relationship.
    expect(relationship.create).toHaveBeenCalledTimes(1);
  });

  it('rethrows a uniqueness conflict that no active relationship can explain', async () => {
    const { service, organization, relationship, prisma } = makeHarness();
    organization.findFirst.mockResolvedValue({ id: 'org-socialops' });
    relationship.create.mockRejectedValueOnce(uniqueViolation());

    // Reads return null both times: the conflict is NOT the one-ACTIVE race,
    // so swallowing it would hide a real problem.
    await expect(
      service.attachIfUnmanaged(prisma as never, CLIENT_ID),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

