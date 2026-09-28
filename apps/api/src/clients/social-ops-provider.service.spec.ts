import { jest } from '@jest/globals';
import { InternalServerErrorException } from '@nestjs/common';

import { SocialOpsProviderService } from './social-ops-provider.service.js';

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
 *   4. a slug conflict fails loudly instead of hijacking an external Agency;
 *   5. a concurrent activation converges on ONE active relationship.
 */
function makeTx(over: {
  provider?: { id: string } | null;
  active?: { id: string; organizationId: string } | null;
  createOrgError?: Error;
  createRelError?: Error;
} = {}) {
  const organization = {
    findFirst: jest.fn(async () => (over.provider === undefined ? null : over.provider)),
    create: jest.fn(async () => {
      if (over.createOrgError) throw over.createOrgError;
      return { id: 'org-socialops' };
    }),
  };
  const relationship = {
    findFirst: jest.fn(async () => (over.active === undefined ? null : over.active)),
    create: jest.fn(async () => {
      if (over.createRelError) throw over.createRelError;
      return {
        id: 'rel-1',
        organizationId: 'org-socialops',
      };
    }),
  };
  const tx = { organization, clientAgencyRelationship: relationship } as never;
  const service = new SocialOpsProviderService(tx as never);
  return { service, organization, relationship, tx };
}

describe('SocialOpsProviderService.ensureProviderOrganization', () => {
  it('reuses the existing SOCIALOPS organization instead of creating a second one', async () => {
    const { service, organization, relationship, tx } = makeTx({
      provider: { id: 'org-existing' },
    });
    await expect(service.ensureProviderOrganization(tx)).resolves.toEqual({
      id: 'org-existing',
    });
    // resolve-only path: no row is created, so the provider stays a singleton.
    expect(organization.create).not.toHaveBeenCalled();
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('creates the provider with kind SOCIALOPS and NOT discoverable', async () => {
    const { service, organization, tx } = makeTx({ provider: null });
    const created = await service.ensureProviderOrganization(tx);
    expect(created).toEqual({ id: 'org-socialops' });
    expect(organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'SOCIALOPS',
        // The platform provider is attached automatically, so it must never
        // appear in the external Agency discovery catalog.
        discoveryOptIn: false,
        discoveryApprovedAt: null,
      }),
      select: { id: true },
    });
  });

  it('resolves the provider when a concurrent activation won the create race', async () => {
    const { service, organization, tx } = makeTx({
      provider: null,
      createOrgError: new Error('Unique constraint failed on socialops'),
    });
    // A concurrent transaction committed first.
    organization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'org-winner' });

    await expect(service.ensureProviderOrganization(tx)).resolves.toEqual({
      id: 'org-winner',
    });
  });

  it('rethrows a genuine creation failure rather than masking it', async () => {
    const { service, organization, tx } = makeTx({
      provider: null,
      createOrgError: new Error('connection refused'),
    });
    organization.findFirst.mockResolvedValue(null);
    await expect(service.ensureProviderOrganization(tx)).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('SocialOpsProviderService.attachIfUnmanaged', () => {
  it('creates the ACTIVE platform relationship for a brand-new Client', async () => {
    const { service, relationship, tx } = makeTx({ provider: { id: 'org-socialops' }, active: null });
    await expect(service.attachIfUnmanaged(tx, CLIENT_ID)).resolves.toBe(
      'org-socialops',
    );
    expect(relationship.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: CLIENT_ID,
        organizationId: 'org-socialops',
        status: 'ACTIVE',
        // Neither CLIENT (the user did not ask) nor AGENCY (SocialOps is not
        // an external tenant): the truthful value is PLATFORM.
        initiatedBy: 'PLATFORM',
      }),
      select: { id: true, organizationId: true },
    });
  });

  it('is idempotent: a Client that already has an ACTIVE relationship is untouched', async () => {
    const { service, relationship, tx } = makeTx({
      active: { id: 'rel-existing', organizationId: 'org-agency' },
    });
    await expect(service.attachIfUnmanaged(tx, CLIENT_ID)).resolves.toBe(
      'org-agency',
    );
    // Repeat activation must not create a second relationship.
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('never silently reassigns an external-Agency-managed Client to SocialOps', async () => {
    const { service, relationship, tx } = makeTx({
      active: { id: 'rel-agency', organizationId: 'org-external-agency' },
    });
    const organizationId = await service.attachIfUnmanaged(tx, CLIENT_ID);
    expect(organizationId).toBe('org-external-agency');
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('attaches to an unmanaged Client even when the provider row is missing', async () => {
    const { service, organization, relationship, tx } = makeTx({ provider: null, active: null });
    await expect(service.attachIfUnmanaged(tx, CLIENT_ID)).resolves.toBe(
      'org-socialops',
    );
    // find-or-create ran, exactly once.
    expect(organization.create).toHaveBeenCalledTimes(1);
    expect(relationship.create).toHaveBeenCalledTimes(1);
  });

  it('fails with a controlled error when the platform slug is owned by an external Agency', async () => {
    // Organization.slug is globally UNIQUE and independent of `kind`, so a
    // pre-existing AGENCY can own "socialops". The create then fails on that
    // constraint, and no SOCIALOPS row exists to fall back to.
    const { service, organization, relationship, tx } = makeTx({
      provider: null,
      createOrgError: uniqueViolation(),
    });

    const err = await service
      .attachIfUnmanaged(tx, CLIENT_ID)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InternalServerErrorException);
    const body = (err as { getResponse: () => Record<string, unknown> }).getResponse();
    expect(body.code).toBe('SERVICE_PROVIDER_UNAVAILABLE');
    // The raw database error never reaches the caller.
    expect(JSON.stringify(body)).not.toMatch(/P2002|Unique constraint/);
    // Crucially the Agency is never silently reused: provisioning was
    // attempted once, and no relationship was attached to it.
    expect(organization.create).toHaveBeenCalledTimes(1);
    expect(relationship.create).not.toHaveBeenCalled();
  });

  it('converges on ONE active relationship when a concurrent activation wins', async () => {
    const { service, relationship, tx } = makeTx({
      provider: { id: 'org-socialops' },
      createRelError: uniqueViolation(),
    });
    // First read: nothing attached yet. After the losing insert, a
    // competing transaction's relationship is visible.
    relationship.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'rel-winner', organizationId: 'org-winner' });

    await expect(service.attachIfUnmanaged(tx, CLIENT_ID)).resolves.toBe(
      'org-winner',
    );
    // Exactly one create was attempted; the loser adopted the winner's row
    // rather than failing the activation or writing a second relationship.
    expect(relationship.create).toHaveBeenCalledTimes(1);
  });

  it('rethrows a uniqueness conflict that no active relationship can explain', async () => {
    const { service, tx } = makeTx({
      provider: { id: 'org-socialops' },
      active: null,
      createRelError: uniqueViolation(),
    });
    // Reads return null both times: the conflict is NOT the one-ACTIVE
    // race, so swallowing it would hide a real problem.
    await expect(service.attachIfUnmanaged(tx, CLIENT_ID)).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});
