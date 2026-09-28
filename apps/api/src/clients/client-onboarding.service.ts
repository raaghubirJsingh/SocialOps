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
import { SocialOpsProviderService } from './social-ops-provider.service.js';

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
    private readonly socialOpsProvider: SocialOpsProviderService,
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

    // Persona resolution.
    //
    // Preference order: the account's own stored value first, then an
    // explicit choice the caller is making right now. The second branch
    // exists for accounts created BEFORE the persona was captured at
    // registration (their PendingRegistration row is deleted on
    // completion, so the original discovery answers are unrecoverable).
    // It is an explicit user choice - never derived from `accountType`
    // (AGENTS.md §17.1) - and it is persisted so the question can never be
    // asked twice.
    //
    // The write targets `user.sub`, the subject of the verified JWT. No
    // client-supplied identifier is involved, so this cannot touch another
    // tenant's account.
    let clientType = dbUser.clientType;
    if (!clientType && dto.type) {
      clientType = dto.type;
      await this.prisma.user.update({
        where: { id: user.sub },
        data: { clientType },
      });
    }

    // Verified registration data, or null for a User that predates
    // Registration Phase v1.0 and must still complete the legacy intake.
    const profile = this.resolveVerifiedProfile(dbUser, clientType);
    // Diagnostic only: which verified field the User record lacks, so the
    // legacy-fallback 400 can explain the real cause.
    const missing = profile ? null : this.missingVerifiedField(dbUser);

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
      //
      // Client creation and platform-provider attachment share ONE
      // transaction: either the Client is created AND has its Service
      // Provider, or nothing is written. A failed activation therefore never
      // leaves an orphan Client that cannot connect anything.
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            ...profile,
            ownerUserId: user.sub,
            onboardingStatus: 'ACTIVE',
            onboardingCompletedAt: new Date(),
          },
        });
        const providerOrganizationId =
          await this.socialOpsProvider.attachIfUnmanaged(tx, created.id);
        return { created, providerOrganizationId };
      });
      await this.clientsService.recordEvent(
        client.created.id,
        user.sub,
        'client.created',
        { source: 'SELF_REGISTRATION', type: client.created.type },
      );
      await this.recordActivationEvents(
        client.created,
        user.sub,
        true,
        'SELF_REGISTRATION',
      );
      if (client.providerOrganizationId) {
        await this.clientsService.recordEvent(
          client.created.id,
          user.sub,
          'agency.relationship.attached',
          {
            source: 'PLATFORM',
            organizationId: client.providerOrganizationId,
            initiatedBy: 'PLATFORM',
          },
        );
      }
      return {
        clientId: client.created.id,
        onboardingStatus: client.created.onboardingStatus,
        mobileVerificationRequired: false,
        mobileVerificationExpiresAt: null,
        client: client.created,
      };
    }

    // Legacy fallback: original intake + mobile verification.
    //
    // The 1-Click path sends NO intake at all, so requiring the four
    // fields here guaranteed an unavoidable 400 for any User whose record
    // lacks a persona. That error blamed the payload for a data problem
    // and left the client with no way forward. Instead: use the payload
    // when the caller actually supplied intake, and otherwise report
    // precisely what the account record is missing.
    const client = await this.prisma.client.create({
      data: {
        ...this.legacyIntakeOrExplain(dto, missing),
        onboardingStatus: 'PENDING',
      },
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
  private resolveVerifiedProfile(
    user: {
      email: string;
      fullName: string | null;
      displayName: string | null;
      phone: string | null;
      clientType: ClientType | null;
      phoneVerifiedAt: Date | null;
    },
    /** Persona resolved by the caller, if any; wins over the stored value. */
    clientTypeOverride?: ClientType | null,
  ): VerifiedOnboardingProfile | null {
    const clientType = clientTypeOverride ?? user.clientType;
    if (
      !user.phoneVerifiedAt ||
      !user.phone ||
      !clientType ||
      (user.fullName ?? user.displayName ?? '').trim().length === 0
    ) {
      return null;
    }
    return {
      name: (user.fullName ?? user.displayName ?? '').trim(),
      directEmail: user.email,
      directPhone: user.phone,
      type: clientType,
    };
  }

  /**
   * Name the first verified field this User record is missing, or null when
   * everything the 1-Click path needs is present.
   *
   * Purely diagnostic: it turns the legacy-fallback 400 from an opaque
   * "complete your profile" into a precise, actionable code. The values
   * themselves are NEVER guessed here - `directPhone` and `type` are NOT
   * NULL on Client, and the persona must never be derived from
   * `accountType` (AGENTS.md §17.1), so a User missing one genuinely
   * cannot be activated from the database alone.
   */
  private missingVerifiedField(user: {
    fullName: string | null;
    displayName: string | null;
    phone: string | null;
    clientType: ClientType | null;
    phoneVerifiedAt: Date | null;
  }): 'verifiedPhone' | 'phone' | 'clientType' | 'name' | null {
    if (!user.phoneVerifiedAt) return 'verifiedPhone';
    if (!user.phone) return 'phone';
    if (!user.clientType) return 'clientType';
    if ((user.fullName ?? user.displayName ?? '').trim().length === 0) {
      return 'name';
    }
    return null;
  }

  /**
   * Legacy-fallback intake resolution.
   *
   * The 1-Click path needs no payload at all, so the four identity fields
   * are enforced ONLY when we actually fall back.
   *
   * `missing` is the verified field the User record lacked. When the
   * caller supplied nothing (the 1-Click shape) we do NOT blame the
   * payload with a 400: we surface a self-describing 409 that names the
   * real gap, so the client can render the server's own words. When the
   * caller DID send a partial payload, the original 400 stands because
   * that really is a malformed request.
   */
  private legacyIntakeOrExplain(
    dto: StartOnboardingDto,
    missing: 'verifiedPhone' | 'phone' | 'clientType' | 'name' | null = null,
  ) {
    const { type, name, directEmail, directPhone, ...rest } = dto;
    const supplied = type && name && directEmail && directPhone;

    if (supplied) {
      return { ...rest, type, name, directEmail, directPhone };
    }

    if (!type && !name && !directEmail && !directPhone) {
      // Nothing supplied at all: this is a 1-Click activation that the
      // database cannot satisfy. Explain the real cause instead of
      // returning a misleading validation error.
      throw new ConflictException({
        code: 'ONBOARDING_PROFILE_INCOMPLETE',
        missing,
        message: `Activation could not read the required details from your account record${
          missing ? ` (missing: ${missing})` : ''
        }. Re-verify your registration details, then try again.`,
        detail: `ONBOARDING_PROFILE_INCOMPLETE: the account record is missing "${missing ?? 'required identity data'}".`,
      });
    }

    throw new BadRequestException({
      code: 'ONBOARDING_INTAKE_REQUIRED',
      missing,
      message:
        'A partial onboarding payload was sent. All of type, name, directEmail and directPhone are required together.',
      detail: 'ONBOARDING_INTAKE_REQUIRED: the supplied intake payload is incomplete.',
    });
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
    // Same single-transaction guarantee as the 1-Click path: the Client is
    // never left ACTIVE without its Service Provider relationship.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.client.update({
        where: { id: client.id },
        data: {
          ...(didBind ? { ownerUserId } : {}),
          onboardingStatus: 'ACTIVE',
          onboardingCompletedAt: new Date(),
        },
      });
      const providerOrganizationId = await this.socialOpsProvider.attachIfUnmanaged(
        tx,
        row.id,
      );
      return { row, providerOrganizationId };
    });
    await this.recordActivationEvents(updated.row, ownerUserId, didBind, source);
    if (updated.providerOrganizationId) {
      await this.clientsService.recordEvent(
        updated.row.id,
        ownerUserId,
        'agency.relationship.attached',
        {
          source: 'PLATFORM',
          organizationId: updated.providerOrganizationId,
          initiatedBy: 'PLATFORM',
        },
      );
    }
    return {
      clientId: updated.row.id,
      onboardingStatus: updated.row.onboardingStatus,
      mobileVerificationRequired: false,
      mobileVerificationExpiresAt: null,
      client: updated.row,
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

    // Same single-transaction guarantee as the 1-Click and resume paths: a
    // Client is never left ACTIVE without its Service Provider relationship.
    // The activation and the relationship roll back together.
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id: client.id },
        data: {
          ...(bind ? { ownerUserId: user.sub } : {}),
          onboardingStatus: 'ACTIVE',
          onboardingCompletedAt: new Date(),
        },
      });
      // A no-op when the Client already has an ACTIVE relationship, which is
      // always the case for an Agency-invited Client (the relationship is
      // created together with the Client). Such a Client is therefore never
      // reassigned to the platform provider.
      const providerOrganizationId =
        await this.socialOpsProvider.attachIfUnmanaged(tx, updated.id);
      return { updated, providerOrganizationId };
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
    if (result.providerOrganizationId) {
      await this.clientsService.recordEvent(
        client.id,
        user.sub,
        'agency.relationship.attached',
        {
          source: 'PLATFORM',
          organizationId: result.providerOrganizationId,
          initiatedBy: 'PLATFORM',
        },
      );
    }
    return result.updated;
  }
}