import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Client } from '@prisma/client';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';
import type { StartOnboardingDto } from './dto/create-client.dto.js';
import { MobileVerificationService } from './mobile-verification.service.js';

/**
 * Client onboarding service (Client Module V1).
 *
 * Locked model: ClientOnboardingStatus is EXACTLY PENDING | ACTIVE and is
 * separate from ClientStatus. Normal client-facing operational access
 * requires onboardingStatus = ACTIVE.
 *
 * Controlled activation flows (the ONLY PENDING-time paths):
 *   - Agency-created: invitation -> authenticated invited User (email
 *     match + email verified) -> binding at acceptance -> mobile
 *     verification -> PENDING -> ACTIVE.
 *   - Self-registration: authenticated Individual/Business User (NO
 *     invitation) -> email verified -> Client created PENDING/unbound ->
 *     mobile verification -> binding + PENDING -> ACTIVE.
 * The binding is established ONLY through these controlled flows; the
 * Agency creator NEVER becomes the Client owner.
 */
@Injectable()
export class ClientOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly mobileVerification: MobileVerificationService,
  ) {}

  /** Whether the Client has completed controlled onboarding. */
  isOnboarded(client: Pick<Client, 'onboardingStatus'>): boolean {
    return client.onboardingStatus === 'ACTIVE';
  }

  /**
   * Fail-closed assertion for normal operational access: a PENDING Client
   * is NOT operationally usable by the Client account, regardless of its
   * ClientStatus. Controlled pre-activation routes must NOT call this -
   * they are the only PENDING-time exception.
   */
  assertOnboarded(client: Pick<Client, 'onboardingStatus'>): void {
    if (!this.isOnboarded(client)) {
      throw new ForbiddenException(
        'Client onboarding is pending; operational access is denied',
      );
    }
  }

  /**
   * Operational-status restriction (locked): INACTIVE/SUSPENDED Clients
   * may still VIEW permitted information, but operational (write) actions
   * are blocked. Status changes and relationship termination are exempt
   * (they are how the status is exited).
   */
  assertOperationallyActive(client: Pick<Client, 'status'>): void {
    if (client.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Client is not operationally active (INACTIVE/SUSPENDED)',
      );
    }
  }

  /**
   * Self-registration onboarding, step 1: create the Client PENDING and
   * UNBOUND and issue the mobile verification token. Requires a verified
   * Individual/Business account that does not already own a Client. No
   * Agency invitation and no Organization provisioning is involved.
   */
  async startSelfRegistration(user: JwtAccessPayload, dto: StartOnboardingDto) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser) throw new UnauthorizedException('Authentication required');
    if (dbUser.accountType !== 'INDIVIDUAL_BUSINESS') {
      throw new ForbiddenException(
        'Only Individual/Business accounts can onboard a Client',
      );
    }
    if (!dbUser.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before Client onboarding',
      );
    }
    const existingClients = await this.prisma.client.count({
      where: { ownerUserId: user.sub },
    });
    if (existingClients > 0) {
      throw new ConflictException({
        code: 'CLIENT_ALREADY_BOUND',
        detail: 'This User already owns a Client',
      });
    }

    const client = await this.prisma.client.create({
      data: { ...dto, onboardingStatus: 'PENDING' },
    });
    await this.clientsService.recordEvent(
      client.id,
      user.sub,
      'client.created',
      { source: 'SELF_REGISTRATION', type: client.type },
    );

    const { expiresAt } = await this.mobileVerification.issueVerificationToken(
      client.id,
      user.sub,
    );
    return {
      clientId: client.id,
      onboardingStatus: client.onboardingStatus,
      mobileVerificationRequired: true,
      mobileVerificationExpiresAt: expiresAt,
    };
  }

  /**
   * Controlled activation completion (both paths): consume the mobile
   * verification token, then - per the approved rules - bind the User to
   * the Client (self-registration path) or verify the existing binding
   * (invitation path) and transition onboarding PENDING -> ACTIVE.
   * Activation MUST NOT occur if the email verification is incomplete.
   */
  async completeOnboardingActivation(user: JwtAccessPayload, rawToken: string) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser) throw new UnauthorizedException('Authentication required');
    if (!dbUser.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before activation',
      );
    }

    const consumed = await this.mobileVerification.resolveAndConsume(rawToken);
    if (consumed.outcome !== 'CONSUMED') {
      throw new ForbiddenException(
        `Mobile verification failed (${consumed.outcome})`,
      );
    }

    const client = await this.prisma.client.findUnique({
      where: { id: consumed.clientId },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (client.onboardingStatus === 'ACTIVE') {
      throw new ConflictException('Client is already onboarded');
    }

    let bind = false;
    if (client.ownerUserId === null) {
      // Self-registration path: the controlled binding happens HERE.
      if (dbUser.accountType !== 'INDIVIDUAL_BUSINESS') {
        throw new ForbiddenException(
          'Only Individual/Business accounts can become the Client owner',
        );
      }
      bind = true;
    } else if (client.ownerUserId !== user.sub) {
      // Invitation path with a different User, or an unrelated User:
      // never bind across owners.
      throw new ForbiddenException('Client is bound to another User');
    }

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(bind ? { ownerUserId: user.sub } : {}),
        onboardingStatus: 'ACTIVE',
        onboardingCompletedAt: new Date(),
      },
    });
    if (bind) {
      await this.clientsService.recordEvent(
        client.id,
        user.sub,
        'client.bound',
        { ownerUserId: user.sub, source: 'SELF_REGISTRATION' },
      );
    }
    await this.clientsService.recordEvent(client.id, user.sub, 'client.activated', {
      source: bind ? 'SELF_REGISTRATION' : 'INVITATION',
    });
    return updated;
  }
}