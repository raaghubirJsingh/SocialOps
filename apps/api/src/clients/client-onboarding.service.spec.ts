import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientsService } from './clients.service.js';
import { MobileVerificationService } from './mobile-verification.service.js';
import {
  ProviderAttachRaceError,
  ProviderProvisioningRequiredError,
  SocialOpsProviderService,
} from './social-ops-provider.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;
const asTransactionClient = (transaction: unknown) =>
  transaction as Parameters<ClientsService['recordEvent']>[4];

const USER: JwtAccessPayload = {
  sub: USER_ID,
  email: 'user@example.com',
  accountType: 'CLIENT',
};

const VERIFIED_USER = {
  email: 'user@example.com',
  fullName: 'Test User',
  displayName: null,
  phone: '+15550001111',
  phoneVerifiedAt: new Date(),
  clientType: 'INDIVIDUAL',
  emailVerifiedAt: new Date(),
  accountType: 'CLIENT',
};

const LEGACY_INTAKE = {
  type: 'INDIVIDUAL' as const,
  name: 'Legacy Test Client',
  directEmail: 'legacy-client@example.com',
  directPhone: '+15550002222',
};

function makeHarness(options: {
  dbUser?: typeof VERIFIED_USER | Record<string, unknown>;
  existingClient?: Record<string, unknown> | null;
  creationEvent?: Record<string, unknown> | null;
  providerError?: Error;
  auditError?: Error;
  providerOrganizationId?: string | null;
} = {}) {
  const events: string[] = [];
  const transaction = {
    client: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => null as { id: string } | null),
      update: jest.fn(),
    },
    clientEvent: {
      create: jest.fn(),
    },
    // `pg_advisory_xact_lock` (per-User activation serialization).
    $queryRaw: jest.fn(async () => [] as unknown[]),
  };
  const createdClient = {
    id: CLIENT_ID,
    ownerUserId: USER_ID,
    onboardingStatus: 'ACTIVE',
    type: 'INDIVIDUAL',
  };
  const pendingClient = {
    id: CLIENT_ID,
    ownerUserId: USER_ID,
    onboardingStatus: 'PENDING',
    type: 'INDIVIDUAL',
  };
  const activeClient = { ...pendingClient, onboardingStatus: 'ACTIVE' };

  asMock(transaction.client.create).mockResolvedValue(createdClient);
  asMock(transaction.client.findUnique).mockResolvedValue(pendingClient);
  asMock(transaction.client.update).mockResolvedValue(activeClient);
  if (options.auditError) {
    asMock(transaction.clientEvent.create).mockRejectedValue(options.auditError);
  } else {
    asMock(transaction.clientEvent.create).mockResolvedValue({});
  }

  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    client: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    clientEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        events.push('transaction-start');
        const result = await callback(transaction);
        events.push('transaction-complete');
        return result;
      },
    ),
  };
  asMock(prisma.user.findUnique).mockResolvedValue(
    options.dbUser ?? VERIFIED_USER,
  );
  asMock(prisma.client.findFirst).mockResolvedValue(
    options.existingClient ?? null,
  );
  asMock(prisma.clientEvent.findFirst).mockResolvedValue(
    options.creationEvent ?? {
      details: { source: 'SELF_REGISTRATION' },
    },
  );

  const mobileVerification = {
    issueVerificationToken: jest.fn(async () => {
      events.push('token-issued');
      return { rawToken: 'verification-token', expiresAt: new Date() };
    }),
    resolveAndConsume: jest.fn(),
  };
  const socialOpsProvider = {
    attachIfUnmanaged: jest.fn(),
    provisionProviderOrganization: jest.fn(async () => ({
      id: ORGANIZATION_ID,
    })),
  };
  if (options.providerError) {
    asMock(socialOpsProvider.attachIfUnmanaged).mockRejectedValue(
      options.providerError,
    );
  } else {
    asMock(socialOpsProvider.attachIfUnmanaged).mockResolvedValue(
      options.providerOrganizationId === undefined
        ? ORGANIZATION_ID
        : options.providerOrganizationId,
    );
  }
  const clientsService = new ClientsService(
    prisma as unknown as PrismaService,
  );
  const recordEvent = jest.spyOn(clientsService, 'recordEvent');
  const service = new ClientOnboardingService(
    prisma as unknown as PrismaService,
    clientsService,
    mobileVerification as unknown as MobileVerificationService,
    socialOpsProvider as unknown as SocialOpsProviderService,
  );

  return {
    service,
    prisma,
    transaction,
    events,
    recordEvent,
    mobileVerification,
    socialOpsProvider,
    createdClient,
    pendingClient,
    activeClient,
  };
}

describe('ClientOnboardingService.completeOnboardingActivation', () => {
  it('commits binding, activation, provider attachment, and audit events together', async () => {
    const user: JwtAccessPayload = {
      sub: USER_ID,
      email: 'user@example.com',
      accountType: 'CLIENT',
    };
    const pendingClient = {
      id: CLIENT_ID,
      ownerUserId: null,
      onboardingStatus: 'PENDING',
    };
    const activeClient = {
      ...pendingClient,
      ownerUserId: USER_ID,
      onboardingStatus: 'ACTIVE',
    };
    const transaction = {
      client: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      clientEvent: {
        create: jest.fn(),
      },
    };
    asMock(transaction.client.findUnique).mockResolvedValue(pendingClient);
    asMock(transaction.client.update).mockResolvedValue(activeClient);
    asMock(transaction.clientEvent.create).mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      clientEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    asMock(prisma.user.findUnique).mockResolvedValue({
      emailVerifiedAt: new Date(),
      accountType: 'CLIENT',
    });
    const mobileVerification = {
      resolveAndConsume: jest.fn(),
    };
    const socialOpsProvider = {
      attachIfUnmanaged: jest.fn(),
      provisionProviderOrganization: jest.fn(async () => ({
        id: ORGANIZATION_ID,
      })),
    };
    asMock(mobileVerification.resolveAndConsume).mockResolvedValue({
      outcome: 'CONSUMED',
      clientId: CLIENT_ID,
    });
    asMock(socialOpsProvider.attachIfUnmanaged).mockResolvedValue(
      ORGANIZATION_ID,
    );
    const clientsService = new ClientsService(
      prisma as unknown as PrismaService,
    );
    const service = new ClientOnboardingService(
      prisma as unknown as PrismaService,
      clientsService,
      mobileVerification as unknown as MobileVerificationService,
      socialOpsProvider as unknown as SocialOpsProviderService,
    );

    await service.completeOnboardingActivation(user, 'verification-token');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mobileVerification.resolveAndConsume).toHaveBeenCalledWith(
      'verification-token',
      transaction,
    );
    expect(transaction.clientEvent.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'client.bound' }),
      }),
    );
    expect(transaction.clientEvent.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'client.activated' }),
      }),
    );
    expect(transaction.clientEvent.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'agency.relationship.attached',
        }),
      }),
    );
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });

  it('propagates an activation audit failure from the transaction client', async () => {
    const auditError = new Error('activation audit failed');
    const {
      service,
      prisma,
      transaction,
      recordEvent,
      mobileVerification,
      socialOpsProvider,
    } = makeHarness({ auditError });
    asMock(transaction.client.findUnique).mockResolvedValue({
      id: CLIENT_ID,
      ownerUserId: null,
      onboardingStatus: 'PENDING',
    });
    asMock(mobileVerification.resolveAndConsume).mockResolvedValue({
      outcome: 'CONSUMED',
      clientId: CLIENT_ID,
    });
    asMock(socialOpsProvider.attachIfUnmanaged).mockResolvedValue(
      ORGANIZATION_ID,
    );

    await expect(
      service.completeOnboardingActivation(USER, 'verification-token'),
    ).rejects.toBe(auditError);

    expect(mobileVerification.resolveAndConsume).toHaveBeenCalledWith(
      'verification-token',
      transaction,
    );
    expect(transaction.client.findUnique).toHaveBeenCalledWith({
      where: { id: CLIENT_ID },
    });
    expect(transaction.client.update).toHaveBeenCalled();
    expect(socialOpsProvider.attachIfUnmanaged).toHaveBeenCalledWith(
      transaction,
      CLIENT_ID,
    );
    expect(recordEvent).toHaveBeenCalledWith(
      CLIENT_ID,
      USER_ID,
      'client.bound',
      { ownerUserId: USER_ID, source: 'SELF_REGISTRATION' },
      transaction,
    );
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });
});

describe('ClientOnboardingService.startSelfRegistration - One-Click', () => {
  it('uses one transaction for creation, provider attachment, and audit events without issuing a token', async () => {
    const {
      service,
      transaction,
      recordEvent,
      mobileVerification,
      socialOpsProvider,
      createdClient,
    } = makeHarness();

    const result = await service.startSelfRegistration(USER, {});

    expect(result.client).toEqual(createdClient);
    expect(result.mobileVerificationRequired).toBe(false);
    expect(transaction.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: USER_ID,
        onboardingStatus: 'ACTIVE',
        type: 'INDIVIDUAL',
        name: 'Test User',
      }),
    });
    expect(socialOpsProvider.attachIfUnmanaged).toHaveBeenCalledWith(
      transaction,
      CLIENT_ID,
    );
    expect(recordEvent.mock.calls.map((call) => call[2])).toEqual([
      'client.created',
      'client.bound',
      'client.activated',
      'agency.relationship.attached',
    ]);
    expect(
      recordEvent.mock.calls.every(
        (call) => call[4] === asTransactionClient(transaction),
      ),
    ).toBe(true);
    expect(mobileVerification.issueVerificationToken).not.toHaveBeenCalled();
  });

  it.each(['provider', 'audit'] as const)(
    'propagates %s failures',
    async (failure) => {
      const failureError = new Error(`${failure} failed`);
      const harness = makeHarness(
        failure === 'provider'
          ? { providerError: failureError }
          : { auditError: failureError },
      );

      await expect(
        harness.service.startSelfRegistration(USER, {}),
      ).rejects.toBe(failureError);
      expect(harness.mobileVerification.issueVerificationToken).not.toHaveBeenCalled();
    },
  );
});

describe('ClientOnboardingService.startSelfRegistration - legacy intake', () => {
  const legacyUser = {
    ...VERIFIED_USER,
    phoneVerifiedAt: null,
  };

  it('writes the pending Client and audit through the transaction, then issues the token', async () => {
    const { service, transaction, events, recordEvent, mobileVerification } =
      makeHarness({ dbUser: legacyUser });
    asMock(transaction.client.create).mockResolvedValue({
      id: CLIENT_ID,
      onboardingStatus: 'PENDING',
      type: 'INDIVIDUAL',
    });

    const result = await service.startSelfRegistration(USER, LEGACY_INTAKE);

    expect(result.onboardingStatus).toBe('PENDING');
    expect(result.mobileVerificationRequired).toBe(true);
    expect(transaction.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...LEGACY_INTAKE,
        onboardingStatus: 'PENDING',
      }),
    });
    expect(recordEvent).toHaveBeenCalledWith(
      CLIENT_ID,
      USER_ID,
      'client.created',
      { source: 'SELF_REGISTRATION', type: 'INDIVIDUAL' },
      transaction,
    );
    expect(events).toEqual([
      'transaction-start',
      'transaction-complete',
      'token-issued',
    ]);
    expect(mobileVerification.issueVerificationToken).toHaveBeenCalledWith(
      CLIENT_ID,
      USER_ID,
    );
  });

  it('does not issue a token when the Client/audit transaction fails', async () => {
    const auditError = new Error('creation audit failed');
    const { service, mobileVerification } = makeHarness({
      dbUser: legacyUser,
      auditError,
    });

    await expect(
      service.startSelfRegistration(USER, LEGACY_INTAKE),
    ).rejects.toBe(auditError);
    expect(mobileVerification.issueVerificationToken).not.toHaveBeenCalled();
  });
});

describe('ClientOnboardingService.startSelfRegistration - pending draft resume', () => {
  const existingDraft = {
    id: CLIENT_ID,
    ownerUserId: USER_ID,
    onboardingStatus: 'PENDING',
    type: 'INDIVIDUAL',
  };

  it('activates the verified self-registration draft through one transaction without issuing a token', async () => {
    const {
      service,
      transaction,
      recordEvent,
      mobileVerification,
      socialOpsProvider,
      activeClient,
    } = makeHarness({ existingClient: existingDraft });

    const result = await service.startSelfRegistration(USER, {});

    expect(result.client).toEqual(activeClient);
    expect(result.onboardingStatus).toBe('ACTIVE');
    expect(result.mobileVerificationRequired).toBe(false);
    expect(transaction.client.update).toHaveBeenCalledWith({
      where: { id: CLIENT_ID },
      data: expect.objectContaining({
        onboardingStatus: 'ACTIVE',
      }),
    });
    expect(socialOpsProvider.attachIfUnmanaged).toHaveBeenCalledWith(
      transaction,
      CLIENT_ID,
    );
    expect(recordEvent.mock.calls.map((call) => call[2])).toEqual([
      'client.activated',
      'agency.relationship.attached',
    ]);
    expect(
      recordEvent.mock.calls.every(
        (call) => call[4] === asTransactionClient(transaction),
      ),
    ).toBe(true);
    expect(mobileVerification.issueVerificationToken).not.toHaveBeenCalled();
  });

  it.each(['provider', 'audit'] as const)(
    'propagates %s failures',
    async (failure) => {
      const failureError = new Error(`${failure} failed`);
      const harness = makeHarness({
        existingClient: existingDraft,
        ...(failure === 'provider'
          ? { providerError: failureError }
          : { auditError: failureError }),
      });

      await expect(
        harness.service.startSelfRegistration(USER, {}),
      ).rejects.toBe(failureError);
      expect(harness.mobileVerification.issueVerificationToken).not.toHaveBeenCalled();
    },
  );
});

/**
 * The platform Service Provider can only be provisioned OUTSIDE the activation
 * transaction: a P2002 inside it aborts the whole transaction, so the recovery
 * read could never run (PostgreSQL 25P02). These pin that contract: the
 * activation is retried once in a BRAND-NEW transaction, never more.
 */
describe('ClientOnboardingService - platform Service Provider recovery', () => {
  it('provisions the provider, then retries the activation in a fresh transaction', async () => {
    const harness = makeHarness();
    asMock(
      harness.socialOpsProvider.attachIfUnmanaged,
    ).mockRejectedValueOnce(new ProviderProvisioningRequiredError());

    const result = await harness.service.startSelfRegistration(USER, {});

    expect(result.onboardingStatus).toBe('ACTIVE');
    // Attempt 1 rolled back on the sentinel; attempt 2 committed.
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(
      harness.socialOpsProvider.provisionProviderOrganization,
    ).toHaveBeenCalledTimes(1);
  });

  it('retries an attach race without re-provisioning the provider', async () => {
    const harness = makeHarness();
    asMock(
      harness.socialOpsProvider.attachIfUnmanaged,
    ).mockRejectedValueOnce(new ProviderAttachRaceError(CLIENT_ID));

    const result = await harness.service.startSelfRegistration(USER, {});

    expect(result.onboardingStatus).toBe('ACTIVE');
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    // A concurrent activation already attached a provider: provisioning is
    // not needed, the retry's pre-read adopts the winning relationship.
    expect(
      harness.socialOpsProvider.provisionProviderOrganization,
    ).not.toHaveBeenCalled();
  });

  it('surfaces the failure instead of retrying forever', async () => {
    const harness = makeHarness();
    const sentinel = new ProviderProvisioningRequiredError();
    asMock(harness.socialOpsProvider.attachIfUnmanaged).mockRejectedValue(
      sentinel,
    );

    await expect(
      harness.service.startSelfRegistration(USER, {}),
    ).rejects.toBe(sentinel);

    // Bounded: exactly one retry, never an unbounded loop.
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('refuses a double activation that won the race inside the transaction', async () => {
    // Two simultaneous 1-Click clicks: both pass the pre-check outside the
    // transaction, then the advisory lock serialises them. The loser must see
    // the Client the winner just committed - never a second Client row.
    const harness = makeHarness();
    asMock(harness.transaction.client.findFirst).mockResolvedValue({
      id: CLIENT_ID,
    });

    const err = await harness.service
      .startSelfRegistration(USER, {})
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'CLIENT_ALREADY_BOUND',
    });
    // No duplicate Client, no relationship, no audit trail.
    expect(harness.transaction.client.create).not.toHaveBeenCalled();
    expect(harness.socialOpsProvider.attachIfUnmanaged).not.toHaveBeenCalled();
  });

  it('propagates a provisioning failure with nothing written outside the rolled-back transaction', async () => {
    const harness = makeHarness();
    const provisioningError = new Error('provider provisioning failed');
    asMock(
      harness.socialOpsProvider.attachIfUnmanaged,
    ).mockRejectedValueOnce(new ProviderProvisioningRequiredError());
    asMock(
      harness.socialOpsProvider.provisionProviderOrganization,
    ).mockRejectedValueOnce(provisioningError);

    await expect(
      harness.service.startSelfRegistration(USER, {}),
    ).rejects.toBe(provisioningError);

    // The activation was never re-attempted, and no Client/relationship write
    // escaped onto the base client: the failed attempt is all there was, and
    // PostgreSQL rolls it back entirely.
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(harness.prisma.client.create).not.toHaveBeenCalled();
  });
});

