import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

import type { PendingRegistration, RegistrationOtp } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  OTP_LOCK_MINUTES,
  OTP_MAX_WRONG_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_TTL_MINUTES,
  REGISTRATION_ERROR_CODES,
} from './constants/registration.constants.js';
import {
  EMAIL_VERIFICATION_PROVIDER,
  ProviderUnavailableError,
  WHATSAPP_VERIFICATION_PROVIDER,
} from './providers/verification-provider.port.js';
import type {
  VerificationChannel,
  VerificationProvider,
} from './providers/verification-provider.port.js';

/**
 * Registration OTP service (L4/L5/OPEN-5).
 *
 * Rules enforced here (all LOCKED):
 *   - 6-digit numeric code, leading zero valid (stored as a string)
 *   - Argon2id hash only; raw OTP never persists, never appears in any
 *     API response, never logged outside the dev console
 *   - 5-minute challenge expiry; single-use (usedAt)
 *   - max 3 wrong attempts -> pending-global 1-hour lock (never deletes
 *     the registration)
 *   - resend does NOT reset the wrong-attempt count
 *   - max 3 SUCCESSFUL resends; provider-unavailable dispatch does not
 *     consume quota; initial /start dispatch never counts
 *   - after lock expiry: fresh challenge, attempts = 0, no quota use
 *   - wrong/expired/used are uniform; only the lock state is distinct
 *
 * Concurrency (remediation): exactly one row per (pending, channel) is
 * guaranteed by the composite @@unique([pendingRegistrationId, channel]).
 * All challenge writes below go through a single atomic `upsert` on that
 * compound key, so two concurrent issuers deterministically converge on the
 * same row (no duplicate Selection, no lost attempts/resendCount).
 * Attempt counting and the verified/usedAt stamp run inside a Prisma
 * $transaction so a wrong attempt and a racing success cannot interleave.
 */

export type OtpSendStatus = 'sent' | 'unavailable';

export interface OtpIssueResult {
  sendStatus: OtpSendStatus;
}

export type OtpVerifyResult =
  | { outcome: 'verified'; bothVerified: boolean }
  | { outcome: 'invalid' }
  | { outcome: 'locked'; retryAfterSeconds: number };

export interface OtpResendResult {
  sendStatus: OtpSendStatus | 'already_verified';
  resendRemaining: number;
}

export const UNIFORM_INVALID_MESSAGE = 'Invalid or expired code';
export const LOCKED_MESSAGE = 'Verification temporarily locked';
export const RESEND_LIMIT_MESSAGE = 'Resend limit reached';

/** Argon2id parameters identical to password hashing (approved baseline). */
const OTP_ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 2,
} as const;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_VERIFICATION_PROVIDER)
    private readonly emailProvider: VerificationProvider,
    @Inject(WHATSAPP_VERIFICATION_PROVIDER)
    private readonly whatsappProvider: VerificationProvider,
  ) {}

  /** 6-digit numeric code; leading zeros preserved by padding. */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  providerFor(channel: VerificationChannel): VerificationProvider {
    return channel === 'EMAIL' ? this.emailProvider : this.whatsappProvider;
  }

  destinationFor(
    pending: Pick<PendingRegistration, 'email' | 'phone'>,
    channel: VerificationChannel,
  ): string {
    return channel === 'EMAIL' ? pending.email : pending.phone;
  }

  private async hashOtp(otp: string): Promise<string> {
    return argon2.hash(otp, OTP_ARGON2_OPTS);
  }

  private async safeVerifyOtp(otp: string, codeHash: string): Promise<boolean> {
    try {
      return await argon2.verify(codeHash, otp);
    } catch {
      return false;
    }
  }

  private composeOtpBody(otp: string): string {
    return `Your SocialOps verification code is ${otp}. It is valid for ${OTP_TTL_MINUTES} minutes. SocialOps will never ask you to share this code.`;
  }

  private async findChallenge(
    pendingRegistrationId: string,
    channel: VerificationChannel,
  ): Promise<RegistrationOtp | null> {
    // Composite @@unique([pendingRegistrationId, channel]) guarantees at most
    // one row, so this lookup is deterministic even under concurrency.
    return this.prisma.registrationOtp.findUnique({
      where: { pendingRegistrationId_channel: { pendingRegistrationId, channel } },
    });
  }

  /** Current resend budget left for a channel. */
  async resendRemaining(
    pendingId: string,
    channel: VerificationChannel,
  ): Promise<number> {
    const row = await this.findChallenge(pendingId, channel);
    return Math.max(0, OTP_MAX_RESENDS - (row?.resendCount ?? 0));
  }

  /**
   * Issue (or re-issue in place) the single active challenge for
   * (pending, channel).
   *
   * resetAttempts: false for resends (L5: attempts survive); true for
   * fresh post-lock / phone-change re-issues (attempts = 0).
   * countResend (OPEN-5): true ONLY for explicit user resends that
   * dispatch successfully; false for the initial /start dispatch and
   * post-lock re-issues.
   *
   * Atomicity: the challenge row is written with ONE upsert on the
   * composite @@unique([pendingRegistrationId, channel]) key (no separate
   * find-then-create/update), so concurrent issuers converge on the same
   * row. Resend quota is consumed only after a SUCCESSFUL dispatch, via a
   * guarded atomic `updateMany` (resendCount < max) so two concurrent
   * resends cannot both consume the last quota slot.
   */
  async issueChallenge(
    pending: Pick<PendingRegistration, 'id' | 'email' | 'phone'>,
    channel: VerificationChannel,
    opts: { resetAttempts: boolean; countResend: boolean },
  ): Promise<OtpIssueResult> {
    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Atomic upsert on the composite unique: creates the row on first issue,
    // re-issues the SAME row afterwards. Attempts are preserved unless this
    // is a fresh post-lock re-issue (resetAttempts). resendCount is NOT
    // incremented here - quota is consumed only after a successful dispatch
    // (guarded updateMany below).
    const row = await this.prisma.registrationOtp.upsert({
      where: { pendingRegistrationId_channel: { pendingRegistrationId: pending.id, channel } },
      create: {
        pendingRegistrationId: pending.id,
        channel,
        codeHash,
        expiresAt,
        attempts: 0,
        resendCount: 0,
      },
      update: {
        codeHash,
        expiresAt,
        usedAt: null,
        ...(opts.resetAttempts ? { attempts: 0 } : {}),
      },
    });

    // Dispatch AFTER persisting: if dispatch fails the challenge still
    // exists (the user can retry via resend without quota loss).
    const sendStatus = await this.dispatch(pending, channel, otp);

    if (sendStatus === 'sent' && opts.countResend) {
      // OPEN-5: only a SUCCESSFUL dispatch consumes resend quota. Guarded
      // atomic increment: succeeds only while a slot remains, so concurrent
      // resends cannot overshoot the cap of 3.
      const consumed = await this.prisma.registrationOtp.updateMany({
        where: { id: row.id, resendCount: { lt: OTP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (consumed.count === 0) {
        throw new ForbiddenException({
          code: REGISTRATION_ERROR_CODES.OTP_RESEND_LIMIT,
          message: RESEND_LIMIT_MESSAGE,
        });
      }
    }

    return { sendStatus };
  }

  /** Dispatch via the channel provider; any failure = 'unavailable' (L14). */
  private async dispatch(
    pending: Pick<PendingRegistration, 'email' | 'phone'>,
    channel: VerificationChannel,
    otp: string,
  ): Promise<OtpSendStatus> {
    try {
      const provider = this.providerFor(channel);
      if (!provider.isAvailable()) {
        throw new ProviderUnavailableError(channel, 'provider unavailable');
      }
      await provider.send({
        to: this.destinationFor(pending, channel),
        subject: 'Your SocialOps verification code',
        body: this.composeOtpBody(otp),
      });
      return 'sent';
    } catch {
      // Provider-side failure: keep the pending active, consume no quota,
      // never bypass verification (L14/OPEN-5). Fail-closed on ANY error.
      return 'unavailable';
    }
  }

  /**
   * Explicit user resend (L4/OPEN-5):
   * - active 1-hour lock wins (throws with retryAfterSeconds)
   * - resend does NOT reset attempts (in-place re-issue preserves them)
   * - quota counts only successful dispatches
   *
   * Atomicity: the quota slot is reserved FIRST with a guarded atomic
   * `updateMany` (resendCount < max). Concurrent resends therefore cannot
   * overshoot the cap of 3. The slot is refunded if dispatch fails, so a
   * provider-unavailable send consumes NO quota (OPEN-5/L14). Attempts are
   * never touched here (L5).
   */
  async resend(
    pending: PendingRegistration,
    channel: VerificationChannel,
  ): Promise<OtpResendResult> {
    const now = new Date();
    let effective = pending;

    if (pending.lockedUntil && pending.lockedUntil.getTime() > now.getTime()) {
      throw new ForbiddenException({
        code: REGISTRATION_ERROR_CODES.OTP_LOCKED,
        message: LOCKED_MESSAGE,
        retryAfterSeconds: Math.ceil(
          (pending.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      });
    }
    if (pending.lockedUntil) {
      effective = await this.releaseExpiredLock(pending);
    }

    const verifiedAt =
      channel === 'EMAIL' ? effective.emailVerifiedAt : effective.whatsappVerifiedAt;
    if (verifiedAt) {
      return {
        sendStatus: 'already_verified',
        resendRemaining: await this.resendRemaining(effective.id, channel),
      };
    }

    // Reserve one resend slot atomically BEFORE dispatching, so concurrent
    // resends cannot overshoot the cap. When no row exists yet (first resend
    // before any challenge - defensive only; /start always issues one), seed
    // the row with resendCount 1 inside the same atomic step.
    const existing = await this.findChallenge(effective.id, channel);
    if (existing && existing.resendCount >= OTP_MAX_RESENDS) {
      throw new ForbiddenException({
        code: REGISTRATION_ERROR_CODES.OTP_RESEND_LIMIT,
        message: RESEND_LIMIT_MESSAGE,
      });
    }
    if (existing) {
      const reserved = await this.prisma.registrationOtp.updateMany({
        where: { id: existing.id, resendCount: { lt: OTP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (reserved.count === 0) {
        throw new ForbiddenException({
          code: REGISTRATION_ERROR_CODES.OTP_RESEND_LIMIT,
          message: RESEND_LIMIT_MESSAGE,
        });
      }
    }

    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Re-issue the same row IN PLACE: attempts survive (L5). Upsert keeps
    // this atomic against a racing issuer. resendCount is deliberately NOT
    // in the update branch: the guarded reservation above already incremented
    // the counter in the database, and writing a stale absolute value here
    // would lose a concurrent resend's increment. Only the create branch
    // (no pre-existing row) seeds resendCount 1.
    const row = await this.prisma.registrationOtp.upsert({
      where: { pendingRegistrationId_channel: { pendingRegistrationId: effective.id, channel } },
      create: {
        pendingRegistrationId: effective.id,
        channel,
        codeHash,
        expiresAt,
        attempts: 0,
        resendCount: 1,
      },
      update: {
        codeHash,
        expiresAt,
        usedAt: null,
      },
    });

    const sendStatus = await this.dispatch(effective, channel, otp);
    if (sendStatus !== 'sent') {
      // OPEN-5: provider failure consumes NO quota - refund the reservation.
      await this.prisma.registrationOtp.updateMany({
        where: { id: row.id, resendCount: { gt: 0 } },
        data: { resendCount: { decrement: 1 } },
      });
    }

    return {
      sendStatus,
      resendRemaining: await this.resendRemaining(effective.id, channel),
    };
  }

  /**
   * After the 1-hour lock expires: clear the lock and issue FRESH
   * challenges (attempts = 0) for every channel not yet verified.
   * Fresh post-lock challenges do NOT consume resend quota (OPEN-5).
   * Verified channels are left untouched.
   */
  async releaseExpiredLock(
    pending: PendingRegistration,
  ): Promise<PendingRegistration> {
    const cleared = await this.prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: { lockedUntil: null },
    });

    if (!pending.emailVerifiedAt) {
      await this.issueChallenge(cleared, 'EMAIL', {
        resetAttempts: true,
        countResend: false,
      });
    }
    if (!pending.whatsappVerifiedAt) {
      await this.issueChallenge(cleared, 'WHATSAPP', {
        resetAttempts: true,
        countResend: false,
      });
    }

    return cleared;
  }

  /**
   * Verify one channel's OTP against the active challenge.
   * Uniform outcome for wrong/expired/used codes; only the lock is a
   * distinct outcome. Success stamps the pending-level verified
   * timestamp and marks the challenge single-use (usedAt).
   *
   * Atomicity: the success path (pending stamp + usedAt) runs inside ONE
   * Prisma $transaction. The wrong-attempt path runs as a CONDITIONAL
   * atomic `updateMany` whose `where` guard (`attempts < max - 1`) is
   * evaluated by PostgreSQL at write time, so two concurrent wrong
   * attempts cannot both pass the check and cannot lose an increment:
   * only one wins the guard and the other falls through to the lock
   * path. Exactly 3 wrong attempts -> 1-hour lock (L4), regardless of
   * concurrency.
   */
  async verify(
    pending: PendingRegistration,
    channel: VerificationChannel,
    otp: string,
  ): Promise<OtpVerifyResult> {
    const now = new Date();
    let effective = pending;

    if (pending.lockedUntil && pending.lockedUntil.getTime() > now.getTime()) {
      return {
        outcome: 'locked',
        retryAfterSeconds: Math.ceil(
          (pending.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      };
    }
    if (pending.lockedUntil) {
      effective = await this.releaseExpiredLock(pending);
    }

    const channelVerifiedAt =
      channel === 'EMAIL' ? effective.emailVerifiedAt : effective.whatsappVerifiedAt;
    if (channelVerifiedAt) {
      return {
        outcome: 'verified',
        bothVerified: Boolean(effective.emailVerifiedAt) &&
          Boolean(effective.whatsappVerifiedAt),
      };
    }

    const row = await this.findChallenge(effective.id, channel);
    if (!row || row.usedAt || now.getTime() >= row.expiresAt.getTime()) {
      return { outcome: 'invalid' };
    }

    const ok = await this.safeVerifyOtp(otp, row.codeHash);
    if (ok) {
      const stamp = channel === 'EMAIL' ? 'emailVerifiedAt' : 'whatsappVerifiedAt';
      // Single atomic transaction: stamp the pending verification AND
      // single-use the challenge together, so a racing wrong attempt cannot
      // slip between the two writes.
      const [updated] = await this.prisma.$transaction([
        this.prisma.pendingRegistration.update({
          where: { id: effective.id },
          data: { [stamp]: now },
        }),
        this.prisma.registrationOtp.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: now },
        }),
      ]);
      return {
        outcome: 'verified',
        bothVerified: Boolean(updated.emailVerifiedAt) &&
          Boolean(updated.whatsappVerifiedAt),
      };
    }

    // CONDITIONAL atomic increment (remediation). The previous code read
    // `row.attempts` outside any transaction and wrote an absolute value
    // (`attempts: row.attempts + 1`), so two concurrent wrong attempts both
    // read the same starting count and the second write clobbered the first
    // (lost increment) - the lock fired on the 4th wrong attempt instead of
    // the 3rd. The guard below is evaluated by PostgreSQL at write time:
    //
    //   attempts semantics: 0 -> 1st wrong (invalid), 1 -> 2nd wrong
    //   (invalid), 2 -> 3rd wrong (lock). The guard `lt: max - 1` (= lt: 2)
    //   lets attempts 0 and 1 increment; when attempts is already 2 the
    //   guard fails (count === 0) and we fall through to the lock path.
    //
    // A racing verifier that also reaches this point sees the same guard:
    // exactly one of the two wins the increment, and the loser falls
    // through to the lock path. The threshold can never be overshot.
    const incremented = await this.prisma.registrationOtp.updateMany({
      where: { id: row.id, attempts: { lt: OTP_MAX_WRONG_ATTEMPTS - 1 } },
      data: { attempts: { increment: 1 } },
    });

    if (incremented.count === 0) {
      // The threshold was already reached - by this request's earlier read
      // or by a concurrent verifier that won the guard first. Set the
      // pending-global 1-hour lock atomically with the final attempt count.
      // Re-read the lock state INSIDE the transaction so a lock already set
      // by a racing request is observed and not clobbered (the lock is
      // idempotent: setting it again to the same 1-hour window is harmless,
      // but we avoid a pointless write when it is already active).
      const lockedUntil = new Date(now.getTime() + OTP_LOCK_MINUTES * 60 * 1000);
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.pendingRegistration.findUnique({
          where: { id: effective.id },
          select: { lockedUntil: true },
        });
        if (current?.lockedUntil && current.lockedUntil.getTime() > Date.now()) {
          return; // already locked by a concurrent verifier
        }
        await tx.registrationOtp.updateMany({
          where: { id: row.id },
          data: { attempts: OTP_MAX_WRONG_ATTEMPTS },
        });
        await tx.pendingRegistration.update({
          where: { id: effective.id },
          data: { lockedUntil },
        });
      });
      return { outcome: 'locked', retryAfterSeconds: OTP_LOCK_MINUTES * 60 };
    }

    return { outcome: 'invalid' };
  }
}
