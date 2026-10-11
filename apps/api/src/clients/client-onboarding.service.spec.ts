import { jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientsService } from './clients.service.js';
import { MobileVerificationService } from './mobile-verification.service.js';
import { SocialOpsProviderService } from './social-ops-provider.service.js';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

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
});
