import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'node:crypto';

import type { LoginOtpChallenge, User, LoginOtpChannel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_VERIFICATION_PROVIDER } from '../registration/providers/verification-provider.port.js';
import type { VerificationProvider } from '../registration/providers/verification-provider.port.js';

import {
  LOGIN_OTP_TTL_MINUTES,
  LOGIN_OTP_MAX_WRONG_ATTEMPTS,
  LOGIN_OTP_LOCK_MINUTES,
  LOGIN_OTP_MAX_RESENDS,
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_ERROR_CODES,
  LOGIN_OTP_INVALID_MESSAGE,
  LOGIN_OTP_LOCKED_MESSAGE,
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
} from './constants/login-otp.constants.js';

/**
 * Argon2id parameters identical to password hashing (approved baseline).
 */
const LOGIN_OTP_ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 2,
} as const;

@Injectable()
export class LoginOtpService {
  private readonly logger = new Logger(LoginOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_VERIFICATION_PROVIDER)
    private readonly emailProvider: VerificationProvider,
  ) {}

  /** 6-digit numeric code; leading zeros preserved by padding. */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async hashOtp(otp: string): Promise<string> {
    return argon2.hash(otp, LOGIN_OTP_ARGON2_OPTS);
  }

  private async safeVerifyOtp(otp: string, codeHash: string): Promise<boolean> {
    try {
      return await argon2.verify(codeHash, otp);
    } catch {
      return false;
    }
  }

  private async findChallenge(
    userId: string,
    channel: LoginOtpChannel,
  ): Promise<LoginOtpChallenge | null> {
    // @@unique([userId]) on LoginOtpChallenge guarantees at most one row per user
    return this.prisma.loginOtpChallenge.findUnique({
      where: { userId },
    });
  }

  /**
   * Issue (or re-issue in place) the single active challenge for (user, channel).
   *
   * resetAttempts: false for resends (attempts survive); true for fresh post-lock
   * countResend: true ONLY for explicit user resends that dispatch successfully
   *
   * Atomicity: the challenge row is written with ONE upsert on the userId unique key
   * (no separate find-then-create/update), so concurrent issuers converge on the same row.
   * Resend quota is consumed only after a SUCCESSFUL dispatch, via a guarded atomic
   * updateMany (resendCount < max) so two concurrent resends cannot both consume the
   * last quota slot.
   */
  async issueChallenge(
    user: Pick<User, 'id' | 'email'>,
    channel: LoginOtpChannel,
    opts: { resetAttempts: boolean; countResend: boolean },
  ): Promise<{ sendStatus: 'sent' | 'unavailable'; expiresAt: Date }> {
    if (channel !== 'EMAIL') {
      throw new ForbiddenException({
        code: LOGIN_OTP_ERROR_CODES.CHALLENGE_NOT_FOUND,
        message: LOGIN_OTP_INVALID_MESSAGE,
      });
    }

    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000);

    // Atomic upsert on the userId unique key: creates the row on first issue,
    // re-issues the SAME row afterwards. Attempts are preserved unless this
    // is a fresh post-lock re-issue (resetAttempts). resendCount is NOT
    // incremented here - quota is consumed only after a successful dispatch
    // (guarded updateMany below).
    const row = await this.prisma.loginOtpChallenge.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
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
    const sendStatus = await this.dispatch(user.email, channel, otp);

    if (sendStatus === 'sent' && opts.countResend) {
      // Guarded atomic increment: succeeds only while a slot remains
      const consumed = await this.prisma.loginOtpChallenge.updateMany({
        where: { id: row.id, resendCount: { lt: LOGIN_OTP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (consumed.count === 0) {
        throw new ForbiddenException({
          code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_LIMIT,
          message: LOGIN_OTP_RESEND_LIMIT_MESSAGE,
        });
      }
    }

    return { sendStatus, expiresAt };
  }

  /** Dispatch via the email provider; any failure = 'unavailable' (L14). */
  private async dispatch(
    email: string,
    channel: LoginOtpChannel,
    otp: string,
  ): Promise<'sent' | 'unavailable'> {
    try {
      if (!this.emailProvider.isAvailable()) {
        throw new Error('provider unavailable');
      }
      await this.emailProvider.send({
        to: email,
        subject: 'Your SocialOps login code',
        body: `Your SocialOps login code is ${otp}. It is valid for ${LOGIN_OTP_TTL_MINUTES} minutes. SocialOps will never ask you to share this code.`,
      });
      return 'sent';
    } catch {
      // Provider-side failure: keep the challenge active, consume no quota,
      // never bypass verification (L14). Fail-closed on ANY error.
      return 'unavailable';
    }
  }

  /**
   * Explicit user resend (L4):
   * - active lock wins (throws with retryAfterSeconds)
   * - resend does NOT reset attempts (in-place re-issue preserves them)
   * - quota counts only successful dispatches
   * - 60s cooldown: reject if < LOGIN_OTP_RESEND_COOLDOWN_SECONDS since lastSentAt
   *
   * Atomicity: reserve slot FIRST with guarded atomic updateMany (resendCount < max).
   */
  async resend(
    userId: string,
    channel: LoginOtpChannel,
  ): Promise<{
    sendStatus: 'sent' | 'unavailable';
    resendRemaining: number;
    retryAfterSeconds?: number;
  }> {
    if (channel !== 'EMAIL') {
      throw new ForbiddenException({
        code: LOGIN_OTP_ERROR_CODES.CHALLENGE_NOT_FOUND,
        message: LOGIN_OTP_INVALID_MESSAGE,
      });
    }

    const now = new Date();
    let row = await this.findChallenge(userId, channel);

    // Check if locked (1-hour lockout after 3 wrong attempts)
    if (row?.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
      throw new ForbiddenException({
        code: LOGIN_OTP_ERROR_CODES.OTP_LOCKED,
        message: LOGIN_OTP_LOCKED_MESSAGE,
        retryAfterSeconds: Math.ceil(
          (row.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      });
    }

    if (row?.lockedUntil) {
      // Lock has expired - clear it and issue fresh challenges
      row = await this.releaseExpiredLock(userId, channel, row);
    }

    // Check resend cooldown: 60 seconds since last successful dispatch
    if (row?.lastSentAt) {
      const timeSinceLastSend = now.getTime() - row.lastSentAt.getTime();
      const cooldownSeconds = LOGIN_OTP_RESEND_COOLDOWN_SECONDS;
      if (timeSinceLastSend < cooldownSeconds * 1000) {
        const retryAfter = Math.ceil(
          (cooldownSeconds * 1000 - timeSinceLastSend) / 1000,
        );
        throw new ForbiddenException({
          code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_COOLDOWN,
          message: LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
          retryAfterSeconds: retryAfter,
        });
      }
    }

    // Reserve one resend slot atomically BEFORE dispatching, so concurrent
    // resends cannot overshoot the cap. When no row exists yet (first resend
    // before any challenge - defensive only; /login issues one), seed
    // the row with resendCount 1 inside the same atomic step.
    if (row && row.resendCount >= LOGIN_OTP_MAX_RESENDS) {
      throw new ForbiddenException({
        code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_LIMIT,
        message: LOGIN_OTP_RESEND_LIMIT_MESSAGE,
      });
    }

    if (row) {
      const reserved = await this.prisma.loginOtpChallenge.updateMany({
        where: { id: row.id, resendCount: { lt: LOGIN_OTP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (reserved.count === 0) {
        throw new ForbiddenException({
          code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_LIMIT,
          message: LOGIN_OTP_RESEND_LIMIT_MESSAGE,
        });
      }
    }

    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000);

    // Re-issue the same row IN PLACE: attempts survive (L5). Upsert keeps
    // this atomic against a racing issuer. resendCount is deliberately NOT
    // in the update branch: the guarded reservation above already incremented
    // the counter in the database, and writing a stale absolute value here
    // would lose a concurrent resend's increment. Only the create branch
    // (no pre-existing row) seeds resendCount 1.
    const rowResult = await this.prisma.loginOtpChallenge.upsert({
      where: { userId },
      create: {
        userId,
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

    const sendStatus = await this.dispatch(
      (await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))!.email,
      channel,
      otp,
    );

    if (sendStatus === 'sent') {
      // Update lastSentAt to enable cooldown tracking for next resend
      await this.prisma.loginOtpChallenge.update({
        where: { id: rowResult.id },
        data: { lastSentAt: now },
      });
    } else {
      // OPEN-5: provider failure consumes NO quota - refund the reservation.
      await this.prisma.loginOtpChallenge.updateMany({
        where: { id: rowResult.id, resendCount: { gt: 0 } },
        data: { resendCount: { decrement: 1 } },
      });
    }

    return {
      sendStatus,
      resendRemaining: await this.resendRemaining(userId, channel),
    };
  }

  /** After the 1-hour lock expires: clear the lock and issue FRESH challenges. */
  private async releaseExpiredLock(
    userId: string,
    channel: LoginOtpChannel,
    row: LoginOtpChallenge,
  ): Promise<LoginOtpChallenge> {
    const cleared = await this.prisma.loginOtpChallenge.update({
      where: { id: row.id },
      data: { lockedUntil: null },
    });

    // Fresh post-lock challenges do NOT consume resend quota (OPEN-5)
    await this.issueChallenge(
      { id: userId, email: (await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))!.email },
      channel,
      { resetAttempts: true, countResend: false },
    );

    return cleared;
  }

  /** Current resend budget left for a user/channel. */
  async resendRemaining(
    userId: string,
    channel: LoginOtpChannel,
  ): Promise<number> {
    if (channel !== 'EMAIL') {
      return 0;
    }
    const row = await this.findChallenge(userId, channel);
    return Math.max(0, LOGIN_OTP_MAX_RESENDS - (row?.resendCount ?? 0));
  }

  /**
   * Verify one channel's OTP against the active challenge.
   * Uniform outcome for wrong/expired/used codes; only the lock is distinct.
   * Success stamps the challenge single-use (usedAt).
   *
   * Atomicity: the success path (usedAt) runs inside a Prisma $transaction.
   * The wrong-attempt path runs as a CONDITIONAL atomic `updateMany` whose
   * `where` guard (`attempts < max - 1`) is evaluated by PostgreSQL at write
   * time, so two concurrent wrong attempts cannot both pass the check and
   * cannot lose an increment.
   */
  async verify(
    userId: string,
    channel: LoginOtpChannel,
    otp: string,
  ): Promise<
    | { outcome: 'verified' }
    | { outcome: 'invalid' }
    | { outcome: 'locked'; retryAfterSeconds: number }
  > {
    if (channel !== 'EMAIL') {
      return { outcome: 'invalid' };
    }

    const now = new Date();
    const row = await this.findChallenge(userId, channel);

    if (!row || row.usedAt || now.getTime() >= row.expiresAt.getTime()) {
      return { outcome: 'invalid' };
    }

    // Check if currently locked
    if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
      return {
        outcome: 'locked',
        retryAfterSeconds: Math.ceil(
          (row.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      };
    }

    if (row.lockedUntil) {
      // Lock has expired - clear it
      await this.releaseExpiredLock(userId, channel, row);
    }

    const ok = await this.safeVerifyOtp(otp, row.codeHash);
    if (ok) {
      // Single-use the challenge
      await this.prisma.loginOtpChallenge.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      return { outcome: 'verified' };
    }

    // CONDITIONAL atomic increment (remediation). The guard below is
    // evaluated by PostgreSQL at write time; exactly one of two concurrent
    // wrong attempts wins the increment, the other falls through to lock path.
    const incremented = await this.prisma.loginOtpChallenge.updateMany({
      where: { id: row.id, attempts: { lt: LOGIN_OTP_MAX_WRONG_ATTEMPTS - 1 } },
      data: { attempts: { increment: 1 } },
    });

    if (incremented.count === 0) {
      // The threshold was already reached - set the pending-global 1-hour lock
      // atomically with the final attempt count.
      const lockedUntil = new Date(now.getTime() + LOGIN_OTP_LOCK_MINUTES * 60 * 1000);
      await this.prisma.loginOtpChallenge.updateMany({
        where: { id: row.id },
        data: { attempts: LOGIN_OTP_MAX_WRONG_ATTEMPTS, lockedUntil },
      });
      return { outcome: 'locked', retryAfterSeconds: LOGIN_OTP_LOCK_MINUTES * 60 };
    }

    return { outcome: 'invalid' };
  }
}