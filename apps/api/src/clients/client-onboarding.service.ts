import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Client, ClientType } from '@prisma/client';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';
import type { StartOnboardingDto } from './dto/create-client.dto.js';
import { MobileVerificationService } from './mobile-verification.service.js';

/**
 * Self-registration intake resolved from the ALREADY-VERIFIED User row.
 *
 * Every field here comes from data Registration Phase v1.0 verified before
 * the account was even created (email + WhatsApp dual OTP), so the frontend
 * never has to re-ask for it. `null` from {@link resolveVerifiedProfile}
 * means "not enough verified data" and the caller must fall back to the
 * legacy intake + mobile-OTP path.
 */
interface VerifiedOnboardingProfile {
  name: string;
  directEmail: string;
  directPhone: string;
  type: ClientType;
}

/** Result of POST /onboarding/start. */
export interface StartOnboardingResult {
  clientId: string;
  onboardingStatus: 'PENDING' | 'ACTIVE';
  /**
   * FALSE on the 1-Click path: the second mobile OTP is redundant because
   * registration already proved the phone number. TRUE only on the legacy
   * fallback, where a verification code was issued.
   */
  mobileVerificationRequired: boolean;
  mobileVerificationExpiresAt: string | null;
  /** Full Client; non-null whenever the flow completed without an OTP. */
  client: Client | null;
}

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
 *
 * 1-Click Activation (self-registration only):
 *   Registration Phase v1.0 proves BOTH email and WhatsApp BEFORE the User
 *   row is created, and stamps `phoneVerifiedAt` as permanent evidence. A
 *   second mobile OTP at activation therefore re-proves nothing, so the
 *   self-registration path reads name/email/phone/persona straight from
 *   the authenticated User record and completes in ONE request. The
 *   bypass is gated on `phoneVerifiedAt` and is NEVER applied to the
 *   invitation path, which is untouched and still requires its mobile
 *   verification token. A User missing verified data (pre-Registration
 *   rows: no `phoneVerifiedAt`, no phone, or no `clientType`) falls back
 *   to the original intake + mobile-OTP flow unchanged.
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
   * Self-registration onboarding.
   *
   * 1-Click path (the normal case): name, email, phone and persona are read
   * from the ALREADY-VERIFIED User row and the Client is created, bound and
   * activated inside this single request. No second mobile OTP is issued,
   * because Registration Phase v1.0 already verified this exact number.
   *
   * Legacy path (fallback, unchanged): a User without enough verified data
   * still supplies the intake and completes a mobile verification token,
   * exactly as before. Nothing on that path is weakened.
   *
   * Requires a verified CLIENT or SERVICE_PROVIDER account (Registration
   * Phase v1.0 decision 21: a SERVICE_PROVIDER may own their OWN Client
   * record without a second SocialOps identity; a new AccountType value was
   * NOT added). No Agency invitation and no Organization provisioning.
   */
  async startSelfRegistration(
    user: JwtAccessPayload,
    dto: StartOnboardingDto,
  ): Promise<StartOnboardingResult> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser) throw new UnauthorizedException('Authentication required');
    // Eligible: CLIENT (self-managed accounts) and SERVICE_PROVIDER
    // (own + others; may add themselves as a Client). Employees
    // (accountType = null) remain blocked.
    if (
      dbUser.accountType !== 'CLIENT' &&
      dbUser.accountType !== 'SERVICE_PROVIDER'
    ) {
      throw new ForbiddenException(
        'Only Client or Service Provider accounts can onboard a Client',
      );
    }
    if (!dbUser.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification is required before Client onboarding',
      );
    }

    // Verified registration data, or null for a User that predates
    // Registration Phase v1.0 and must still complete the legacy intake.
    const profile = this.resolveVerifiedProfile(dbUser);

    const existing = await this.prisma.client.findFirst({
      where: { ownerUserId: user.sub },
    });
    if (existing) {
      // Resuming the caller's OWN half-finished self-registration draft
      // (created before 1-Click existed) turns that dead end into a
      // working activation. An ACTIVE Client, or a Client this User did
      // not create, is still refused.
      if (
        existing.onboardingStatus === 'PENDING' &&
        (await this.isOwnSelfRegistrationDraft(existing.id, user.sub))
      ) {
        return profile
          ? this.activatePendingClient(existing, user.sub, 'SELF_REGISTRATION')
          : this.issuePendingActivation(existing, user.sub);
      }
      throw new ConflictException({
        code: 'CLIENT_ALREADY_BOUND',
        detail: 'This User already owns a Client',
      });
    }

    if (profile) {
      // 1-Click: the controlled binding happens HERE, on the same
      // self-registration path that has always owned it.
      const client = await this.prisma.client.create({
        data: {
          ...profile,
          ownerUserId: user.sub,
          onboardingStatus: 'ACTIVE',
          onboardingCompletedAt: new Date(),
        },
      });
      await this.clientsService.recordEvent(
        client.id,
        user.sub,
        'client.created',
        { source: 'SELF_REGISTRATION', type: client.type },
      );
      await this.recordActivationEvents(
        client,
        user.sub,
        true,
        'SELF_REGISTRATION',
      );
      return {
        clientId: client.id,
        onboardingStatus: client.onboardingStatus,
        mobileVerificationRequired: false,
        mobileVerificationExpiresAt: null,
        client,
      };
    }

    // Legacy fallback: original intake + mobile verification.
    const client = await this.prisma.client.create({
      data: { ...this.requireLegacyIntake(dto), onboardingStatus: 'PENDING' },
    });
    await this.clientsService.recordEvent(
      client.id,
      user.sub,
      'client.created',
      { source: 'SELF_REGISTRATION', type: client.type },
    );
    return this.issuePendingActivation(client, user.sub);
  }

  /**
   * Resolve the activation intake from ALREADY-VERIFIED User data, or null
   * when the User cannot be activated without asking for more.
   *
   * `phoneVerifiedAt` is the gate that makes the OTP bypass safe: it is
   * stamped only by Registration Phase v1.0 after BOTH the email and the
   * WhatsApp OTP succeed, so it is permanent evidence that this User owns
   * this exact number. A null value means the User predates that flow and
   * must still prove the number a second time.
   *
   * `clientType` (Individual vs Business) is a ClientType and is NEVER
   * inferred from `accountType` (AGENTS.md §17.1); a User without one just
   * keeps the legacy path.
   */
  private resolveVerifiedProfile(user: {
    email: string;
    fullName: string | null;
    displayName: string | null;
    phone: string | null;
    clientType: ClientType | null;
    phoneVerifiedAt: Date | null;
  }): VerifiedOnboardingProfile | null {
    if (!user.phoneVerifiedAt) return null;
    if (!user.phone) return null;
    if (!user.clientType) return null;
    const name = (user.fullName ?? user.displayName ?? '').trim();
    if (name.length === 0) return null;
    return {
      name,
      directEmail: user.email,
      directPhone: user.phone,
      type: user.clientType,
    };
  }

  /**
   * Legacy-fallback intake guard. The 1-Click path needs no payload at all,
   * so these four fields are enforced ONLY when we actually fall back -
   * fail closed rather than persist a half-filled Client.
   */
  private requireLegacyIntake(dto: StartOnboardingDto) {
    const { type, name, directEmail, directPhone, ...rest } = dto;
    if (!type || !name || !directEmail || !directPhone) {
      throw new BadRequestException({
        code: 'ONBOARDING_INTAKE_REQUIRED',
        detail:
          'Client activation requires verified registration data; complete your profile to activate.',
      });
    }
    return { ...rest, type, name, directEmail, directPhone };
  }

  /**
   * True only for a PENDING Client this very User created through the
   * self-registration flow, proven from the insert-only audit trail. An
   * unbound PENDING row alone proves nothing - an Agency-created Client is
   * unbound until someone accepts its invitation - so without this check a
   * User could claim a Client they were never invited to.
   */
  private async isOwnSelfRegistrationDraft(
    clientId: string,
    userId: string,
  ): Promise<boolean> {
    const created = await this.prisma.clientEvent.findFirst({
      where: { clientId, action: 'client.created', actorUserId: userId },
      orderBy: { createdAt: 'asc' },
    });
    const source = (created?.details as { source?: string } | null)?.source;
    return source === 'SELF_REGISTRATION';
  }

  /** Bind (when still unbound) + activate a PENDING Client and record the trail. */
  private async activatePendingClient(
    client: Client,
    ownerUserId: string,
    source: 'SELF_REGISTRATION' | 'INVITATION',
  ): Promise<StartOnboardingResult> {
    const didBind = client.ownerUserId === null;
    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(didBind ? { ownerUserId } : {}),
        onboardingStatus: 'ACTIVE',
        onboardingCompletedAt: new Date(),
      },
    });
    await this.recordActivationEvents(updated, ownerUserId, didBind, source);
    return {
      clientId: updated.id,
      onboardingStatus: updated.onboardingStatus,
      mobileVerificationRequired: false,
      mobileVerificationExpiresAt: null,
      client: updated,
    };
  }

  /**
   * Audit trail for a completed activation. Mirrors the legacy event
   * sequence exactly: client.bound (only when this call made the binding)
   * followed by client.activated.
   */
  private async recordActivationEvents(
    client: Client,
    actorUserId: string,
    didBind: boolean,
    source: 'SELF_REGISTRATION' | 'INVITATION',
  ): Promise<void> {
    if (didBind) {
      await this.clientsService.recordEvent(
        client.id,
        actorUserId,
        'client.bound',
        { ownerUserId: actorUserId, source },
      );
    }
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'client.activated',
      { source },
    );
  }

  /** Legacy path: issue the mobile verification token for a PENDING Client. */
  private async issuePendingActivation(
    client: Client,
    userId: string,
  ): Promise<StartOnboardingResult> {
    const { expiresAt } = await this.mobileVerification.issueVerificationToken(
      client.id,
      userId,
    );
    return {
      clientId: client.id,
      onboardingStatus: client.onboardingStatus,
      mobileVerificationRequired: true,
      mobileVerificationExpiresAt: expiresAt.toISOString(),
      client: null,
    };
  }

  /**
   * Controlled activation completion (both paths): consume the mobile
   * verification token, then - per the approved rules - bind the User to
   * the Client (self-registration path) or verify the existing binding
   * (invitation path) and transition onboarding PENDING -> ACTIVE.
   * Activation MUST NOT occur if the email verification is incomplete.
   *
   * UNCHANGED by the 1-Click refactor: this remains the ONLY way a
   * token-based activation happens, and the invitation path still requires
   * it in full.
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
      // CLIENT or SERVICE_PROVIDER may own their own Client (decision
      // 21); employees (accountType = null) remain blocked.
      if (
        dbUser.accountType !== 'CLIENT' &&
        dbUser.accountType !== 'SERVICE_PROVIDER'
      ) {
        throw new ForbiddenException(
          'Only Client or Service Provider accounts can become the Client owner',
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