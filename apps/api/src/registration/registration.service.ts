import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { Prisma } from '@prisma/client';
import type { ClientType, PendingRegistration } from '@prisma/client';

import { OrganizationProvisioningService } from '../memberships/organization-provisioning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import type { AccountType } from '../auth/dto/account-type.js';
import type {
  OtpResendDto,
  OtpVerifyDto,
  RegistrationPasswordDto,
  RegistrationResumeDto,
  RegistrationStartDto,
} from './dto/registration.dto.js';

import {
  EMAIL_IN_USE_MESSAGE,
  PENDING_NOT_FOUND_MESSAGE,
} from './constants/registration.constants.js';
import {
  LOCKED_MESSAGE,
  OtpService,
  UNIFORM_INVALID_MESSAGE,
} from './otp.service.js';
import {
  PendingRegistrationService,
  generateResumeToken,
  hashResumeToken,
} from './pending-registration.service.js';

/**
 * Registration Phase v1.0 orchestration service.
 *
 * Staged endpoints (all unauthenticated, protected ONLY by the
 * resumeToken stage credential + Redis rate limiting + OTP rules):
 *
 *   start    -> create OR resume (L6) a PendingRegistration, dispatch
 *               BOTH OTP challenges simultaneously (L14-aware)
 *   verify   -> per-channel OTP verification (dual gate)
 *   resend   -> quota-limited resend (L4/OPEN-5)
 *   password -> completion transaction: User created, pending DELETED,
 *               NO JWT/session issued; login remains the only session
 *               issuer (unchanged login/refresh behavior)
 *   resume   -> stage snapshot from the emailed resume link; NEVER a
 *               session (OPEN-1)
 *
 * Invariants:
 *   - Email is the primary identity (OPEN-9): never editable after
 *     Account Creation; identifies the pending before creation.
 *   - createdAt/expiresAt are immutable for a pending row (L6/OPEN-7).
 *   - User.accountType is NEVER null at creation (L13); classification
 *     is never guessed.
 *   - Lazy expiry: every stage touch validates liveness first.
 */

export type ChannelSendStatus = 'sent' | 'unavailable';

export interface StartRegistrationResult {
  status: 'pending_created' | 'pending_resumed';
  /** Raw stage credential - returned ONCE per /start (OPEN-1). */
  resumeToken: string;
  expiresAt: string;
  maskedEmail: string;
  maskedPhone: string;
  accountType: AccountType | null;
  /** Individual-vs-Business persona, when it was collected. */
  clientType: ClientType | null;
  emailVerified: boolean;
  whatsappVerified: boolean;
  sendStatus: { email: ChannelSendStatus; whatsapp: ChannelSendStatus };
  resendRemaining: { email: number; whatsapp: number };
  lockedUntil: string | null;
}

export interface OtpVerifyResponse {
  channel: 'EMAIL' | 'WHATSAPP';
  verified: boolean;
  bothVerified: boolean;
}

export interface OtpResendResponse {
  channel: 'EMAIL' | 'WHATSAPP';
  sendStatus: ChannelSendStatus | 'already_verified';
  resendRemaining: number;
}

export interface RegistrationCompleteResponse {
  status: 'registration_complete';
}

export interface ResumeSnapshotResponse {
  stage: 'verification' | 'password';
  expiresAt: string;
  accountType: AccountType | null;
  clientType: ClientType | null;
  fullName: string;
  maskedEmail: string;
  maskedPhone: string;
  emailVerified: boolean;
  whatsappVerified: boolean;
  resendRemaining: { email: number; whatsapp: number };
  lockedUntil: string | null;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pending: PendingRegistrationService,
    private readonly otp: OtpService,
    private readonly provisioning: OrganizationProvisioningService,
  ) {}

  // ------------------------------------------------------------------
  // POST /auth/registration/start
  // ------------------------------------------------------------------
  async start(dto: RegistrationStartDto): Promise<StartRegistrationResult> {
    // Email is the primary identity and the duplicate key (OPEN-9/L7).
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ForbiddenException(EMAIL_IN_USE_MESSAGE);
    }

    const existing = await this.pending.loadAliveByEmail(dto.email);
    if (existing) {
      // L6: duplicate ACTIVE pending -> resume the SAME row, no second
      // row, no timer reset. Handover requires the CURRENT stage
      // credential so an email alone can never hijack a pending row.
      if (
        !dto.resumeToken ||
        hashResumeToken(dto.resumeToken) !== existing.resumeTokenHash
      ) {
        throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
      }
      return this.resumeExisting(existing, dto);
    }

    // Stale token pointing at nothing (expired/rotated/completed):
    // uniform 404 so old links fail indistinguishably (OPEN-1).
    if (dto.resumeToken) {
      throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
    }

    return this.createNew(dto);
  }
  // CONTINUE-MARKER

  /**
   * Create a brand-new PendingRegistration (no User row exists - L13/
   * E). Dispatches BOTH OTP challenges simultaneously (initial dispatch
   * never consumes resend quota - OPEN-5).
   */
  private async createNew(
    dto: RegistrationStartDto,
  ): Promise<StartRegistrationResult> {
    const rawToken = generateResumeToken();

    let pending: PendingRegistration;
    try {
      pending = await this.prisma.pendingRegistration.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone, // canonical form (OPEN-2, normalized by DTO)
          accountType: dto.accountType ?? null, // may be null (L13)
          // Persona carried to completion; may stay null (legacy fallback).
          clientType: dto.clientType ?? null,
          // JSON snapshot (L8), cast to Prisma's InputJsonValue.
          discoveryAnswers: dto.discoveryAnswers as Prisma.InputJsonValue | undefined,
          resumeTokenHash: hashResumeToken(rawToken),
          expiresAt: this.pending.computeExpiresAt(new Date()), // +72h
        },
      });
    } catch (error) {
      // Unique race on PendingRegistration.email: another identical
      // /start won the row. No credential is ever handed back without
      // proof, so surface an explicit conflict instead.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Registration already in progress for this email',
        );
      }
      throw error;
    }

    const [emailSend, whatsappSend] = await Promise.all([
      this.otp.issueChallenge(pending, 'EMAIL', {
        resetAttempts: false,
        countResend: false,
      }),
      this.otp.issueChallenge(pending, 'WHATSAPP', {
        resetAttempts: false,
        countResend: false,
      }),
    ]);

    return this.buildStartResult('pending_created', pending, rawToken, {
      email: emailSend.sendStatus,
      whatsapp: whatsappSend.sendStatus,
    });
  }

  private async buildStartResult(
    status: 'pending_created' | 'pending_resumed',
    pending: PendingRegistration,
    rawToken: string,
    sendStatus: { email: ChannelSendStatus; whatsapp: ChannelSendStatus },
  ): Promise<StartRegistrationResult> {
    const [emailRemaining, whatsappRemaining] = await Promise.all([
      this.otp.resendRemaining(pending.id, 'EMAIL'),
      this.otp.resendRemaining(pending.id, 'WHATSAPP'),
    ]);
    return {
      status,
      resumeToken: rawToken,
      expiresAt: pending.expiresAt.toISOString(),
      maskedEmail: maskEmail(pending.email),
      maskedPhone: maskPhone(pending.phone),
      accountType: pending.accountType,
      clientType: pending.clientType,
      emailVerified: Boolean(pending.emailVerifiedAt),
      whatsappVerified: Boolean(pending.whatsappVerifiedAt),
      sendStatus,
      resendRemaining: { email: emailRemaining, whatsapp: whatsappRemaining },
      lockedUntil: pending.lockedUntil?.toISOString() ?? null,
    };
  }
  /**
   * L6 + OPEN-9: resume an ACTIVE pending for the same email.
   * - mutable fields update in place (name, phone, classification,
   *   discovery answers); createdAt/expiresAt/timer NEVER change
   * - the stage credential rotates (fresh raw returned; old invalid)
   * - BOTH OTP challenges re-dispatch fresh codes; wrong-attempt counts
   *   and resend quotas are preserved (no reset via /start)
   * - a CHANGED phone clears whatsappVerifiedAt (stale-proof) so a
   *   verification for the OLD number can never satisfy the dual gate
   */
  private async resumeExisting(
    existing: PendingRegistration,
    dto: RegistrationStartDto,
  ): Promise<StartRegistrationResult> {
    const phoneChanged = dto.phone !== existing.phone;
    const accountType =
      dto.accountType !== undefined ? dto.accountType : existing.accountType;
    const clientType =
      dto.clientType !== undefined ? dto.clientType : existing.clientType;

    const updated = await this.prisma.pendingRegistration.update({
      where: { id: existing.id },
      data: {
        fullName: dto.fullName,
        accountType,
        clientType,
        ...(dto.discoveryAnswers !== undefined
          ? {
              discoveryAnswers:
                dto.discoveryAnswers as Prisma.InputJsonValue,
            }
          : {}),
        ...(phoneChanged
          ? { phone: dto.phone, whatsappVerifiedAt: null }
          : {}),
        // createdAt / expiresAt deliberately absent: timer never resets.
      },
    });

    // Single-credential rotation (OPEN-1): repeat /start issues a new
    // raw token; the previous one is immediately invalid.
    const rawToken = await this.pending.rotateResumeToken(updated.id);

    const [emailSend, whatsappSend] = await Promise.all([
      this.otp.issueChallenge(updated, 'EMAIL', {
        resetAttempts: false,
        countResend: false,
      }),
      this.otp.issueChallenge(updated, 'WHATSAPP', {
        resetAttempts: false,
        countResend: false,
      }),
    ]);

    const fresh = await this.prisma.pendingRegistration.findUniqueOrThrow({
      where: { id: updated.id },
    });

    return this.buildStartResult('pending_resumed', fresh, rawToken, {
      email: emailSend.sendStatus,
      whatsapp: whatsappSend.sendStatus,
    });
  }

  // ------------------------------------------------------------------
  // POST /auth/registration/otp/verify
  // ------------------------------------------------------------------
  async verify(dto: OtpVerifyDto): Promise<OtpVerifyResponse> {
    const pending = await this.pending.loadAliveByToken(dto.resumeToken);
    if (!pending) {
      throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
    }

    const result = await this.otp.verify(pending, dto.channel, dto.otp);
    if (result.outcome === 'invalid') {
      throw new ForbiddenException(UNIFORM_INVALID_MESSAGE);
    }
    if (result.outcome === 'locked') {
      throw new ForbiddenException({
        message: LOCKED_MESSAGE,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return {
      channel: dto.channel,
      verified: true,
      bothVerified: result.bothVerified,
    };
  }

  // ------------------------------------------------------------------
  // POST /auth/registration/otp/resend
  // (otp.resend throws LOCKED / resend-limit ForbiddenExceptions itself)
  // ------------------------------------------------------------------
  async resend(dto: OtpResendDto): Promise<OtpResendResponse> {
    const pending = await this.pending.loadAliveByToken(dto.resumeToken);
    if (!pending) {
      throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
    }
    const result = await this.otp.resend(pending, dto.channel);
    return {
      channel: dto.channel,
      sendStatus: result.sendStatus,
      resendRemaining: result.resendRemaining,
    };
  }
  // ------------------------------------------------------------------
  // POST /auth/registration/password - completion transaction
  // ------------------------------------------------------------------
  async password(dto: RegistrationPasswordDto): Promise<RegistrationCompleteResponse> {
    let pending = await this.pending.loadAliveByToken(dto.resumeToken);
    if (!pending) {
      throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
    }

    // Dual gate: BOTH verifications mandatory; a provider outage can
    // never satisfy or bypass either (L14).
    if (!pending.emailVerifiedAt || !pending.whatsappVerifiedAt) {
      throw new ForbiddenException('Both verifications must be completed');
    }
    // L13: classification must be resolved BEFORE Account Creation and
    // is never guessed by the server. The resume path may carry the
    // explicit forced-choice selection here (accountType on the DTO).
    const accountType = pending.accountType ?? dto.accountType ?? null;
    if (!accountType) {
      throw new ForbiddenException('Account type is required');
    }

    // Resume path: persist the explicit forced choice on the pending row
    // (never guessed; only reachable after the UI's forced-choice step).
    if (!pending.accountType && dto.accountType) {
      pending = await this.prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { accountType: dto.accountType },
      });
    }

    // Individual-vs-Business persona, same forced-choice treatment. It is
    // NOT required (never guessed, never blocking): NULL simply means the
    // Client activation later falls back to the legacy path. Persisted so
    // the 1-Click activation never re-asks the persona (AGENTS.md §17.1).
    const clientType = pending.clientType ?? dto.clientType ?? null;
    if (!pending.clientType && dto.clientType) {
      pending = await this.prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { clientType: dto.clientType },
      });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 2,
    });
    const now = new Date();

    let userId: string;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: pending.email, // primary identity, immutable (OPEN-9)
            passwordHash,
            displayName: pending.fullName, // back-compat (§17.2 pattern)
            fullName: pending.fullName,
            phone: pending.phone, // canonical (OPEN-2)
            accountType, // non-null (L13)
            // Persona captured once here; NULL = legacy activation path.
            clientType,
            isActive: true, // verified via dual OTP, then active
            emailVerifiedAt: now, // email OTP evidence
            phoneVerifiedAt: now, // L9 permanent WhatsApp/phone evidence
          },
          select: { id: true },
        });
        // PendingRegistration dies WITH completion: all temporary
        // sensitive data goes, OTP rows cascade, and the current
        // resumeToken is immediately invalid (D1-A invariant).
        await tx.pendingRegistration.delete({ where: { id: pending.id } });
        return created;
      });
      userId = user.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ForbiddenException(EMAIL_IN_USE_MESSAGE);
      }
      throw error;
    }

    // Post-commit, non-fatal: SERVICE_PROVIDER tenant provisioning
    // (mirrors the existing non-blocking pattern at auth.service).
    // CLIENT users receive no Organization - exactly as
    // INDIVIDUAL_BUSINESS users never did.
    try {
      await this.provisioning.ensureForServiceProvider(userId);
    } catch (error) {
      this.logger.warn(
        `Provisioning after registration failed (non-fatal): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // NEVER a JWT/session here (registration invariant): the client
    // routes to /login, the ONLY session issuer (unchanged).
    return { status: 'registration_complete' };
  }

  // ------------------------------------------------------------------
  // POST /auth/registration/resume - stage snapshot, never a session
  // ------------------------------------------------------------------
  async resume(dto: RegistrationResumeDto): Promise<ResumeSnapshotResponse> {
    const pending = await this.pending.loadAliveByToken(dto.resumeToken);
    if (!pending) {
      throw new NotFoundException(PENDING_NOT_FOUND_MESSAGE);
    }

    const [emailRemaining, whatsappRemaining] = await Promise.all([
      this.otp.resendRemaining(pending.id, 'EMAIL'),
      this.otp.resendRemaining(pending.id, 'WHATSAPP'),
    ]);

    const bothVerified = Boolean(pending.emailVerifiedAt) &&
      Boolean(pending.whatsappVerifiedAt);
    return {
      stage: bothVerified ? 'password' : 'verification',
      expiresAt: pending.expiresAt.toISOString(),
      accountType: pending.accountType,
      clientType: pending.clientType,
      fullName: pending.fullName,
      maskedEmail: maskEmail(pending.email),
      maskedPhone: maskPhone(pending.phone),
      emailVerified: Boolean(pending.emailVerifiedAt),
      whatsappVerified: Boolean(pending.whatsappVerifiedAt),
      resendRemaining: { email: emailRemaining, whatsapp: whatsappRemaining },
      lockedUntil: pending.lockedUntil?.toISOString() ?? null,
    };
  }
}

/** j***@example.com - never echo the full address back in snapshots. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

/** +91******4321 - last 4 digits only. */
export function maskPhone(phone: string): string {
  const tail = phone.slice(-4);
  return `+*******${tail}`;
}
