import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { randomInt } from 'node:crypto';

import type { AdminStepUpChallenge, AdminStepUpSession, User, AdminStepUpChannel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  ADMIN_STEP_UP_ERROR_CODES,
  ADMIN_STEP_UP_INVALID_MESSAGE,
  ADMIN_STEP_UP_LOCKED_MESSAGE,
  ADMIN_STEP_UP_LOCK_MINUTES,
  ADMIN_STEP_UP_MAX_RESENDS,
  ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS,
  ADMIN_STEP_UP_RESEND_LIMIT_MESSAGE,
  ADMIN_STEP_UP_SESSION_TTL_MINUTES,
  ADMIN_STEP_UP_TTL_MINUTES,
  ADMIN_STEP_UP_SESSION_INVALID_MESSAGE,
} from './constants/admin.constants.js';

/**
 * Argon2id parameters identical to password hashing (approved baseline).
 */
const ADMIN_STEP_UP_ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 2,
} as const;

/**
 * SuperAdmin step-up OTP service (Decision 020 §6).
 *
 * Mirrors RegistrationOtp service patterns with the following differences:
 * - Challenges are scoped to User (not PendingRegistration)
 * - Uses AdminStepUpChallenge and AdminStepUpSession models
 * - Issues short-lived session tokens after successful verification
 * - Sessions are single-use: consumed on first SUPERADMIN request
 */
@Injectable()
export class AdminStepUpService {
  constructor(private readonly prisma: PrismaService) {}

  /** 6-digit numeric code; leading zeros preserved by padding. */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** Generate cryptographically secure random session token (32 bytes). */
  generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private async hashOtp(otp: string): Promise<string> {
    return argon2.hash(otp, ADMIN_STEP_UP_ARGON2_OPTS);
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
    channel: AdminStepUpChannel,
  ): Promise<AdminStepUpChallenge | null> {
    // @@unique([userId]) on AdminStepUpChallenge guarantees at most one row per user
    // Note: channel is ignored in the lookup as there's only one challenge per user
    return this.prisma.adminStepUpChallenge.findUnique({
      where: { userId: userId },
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
    user: Pick<User, 'id'>,
    channel: AdminStepUpChannel,
    opts: { resetAttempts: boolean; countResend: boolean },
  ): Promise<{ sendStatus: 'sent' | 'unavailable' }> {
    if (channel !== 'EMAIL') {
      throw new ForbiddenException({
        code: ADMIN_STEP_UP_ERROR_CODES.CHALLENGE_NOT_FOUND,
        message: ADMIN_STEP_UP_INVALID_MESSAGE,
      });
    }

    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + ADMIN_STEP_UP_TTL_MINUTES * 60 * 1000);

    // Atomic upsert on the userId unique key: creates the row on first issue,
    // re-issues the SAME row afterwards. Attempts are preserved unless this
    // is a fresh post-lock re-issue (resetAttempts). resendCount is NOT
    // incremented here - quota is consumed only after a successful dispatch
    // (guarded updateMany below).
    const row = await this.prisma.adminStepUpChallenge.upsert({
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

    // Dispatch logic would go here if we had providers; for now assume sent
    const sendStatus = 'sent';

    if (sendStatus === 'sent' && opts.countResend) {
      // Guarded atomic increment: succeeds only while a slot remains
      const consumed = await this.prisma.adminStepUpChallenge.updateMany({
        where: { id: row.id, resendCount: { lt: ADMIN_STEP_UP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (consumed.count === 0) {
        throw new ForbiddenException({
          code: ADMIN_STEP_UP_ERROR_CODES.OTP_RESEND_LIMIT,
          message: ADMIN_STEP_UP_RESEND_LIMIT_MESSAGE,
        });
      }
    }

    return { sendStatus };
  }

  /**
   * Verify OTP against active challenge.
   * Uniform outcome for wrong/expired/used codes; only the lock is distinct.
   * Success marks the challenge single-use (usedAt).
   */
  async verify(
    userId: string,
    channel: AdminStepUpChannel,
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
    if (
      row.lockedUntil &&
      row.lockedUntil.getTime() > now.getTime()
    ) {
      return {
        outcome: 'locked',
        retryAfterSeconds: Math.ceil(
          (row.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      };
    }

    const ok = await this.safeVerifyOtp(otp, row.codeHash);
    if (ok) {
      // Single-use the challenge
      await this.prisma.adminStepUpChallenge.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      return { outcome: 'verified' };
    }

    // Failed verification: increment attempts atomically with guard
    const incremented = await this.prisma.adminStepUpChallenge.updateMany({
      where: {
        id: row.id,
        attempts: { lt: ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS - 1 },
      },
      data: { attempts: { increment: 1 } },
    });

    if (incremented.count === 0) {
      // Threshold reached: set 1-hour lock
      const lockedUntil = new Date(
        now.getTime() + ADMIN_STEP_UP_LOCK_MINUTES * 60 * 1000,
      );
      await this.prisma.adminStepUpChallenge.updateMany({
        where: { id: row.id },
        data: { attempts: ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS, lockedUntil },
      });
      return {
        outcome: 'locked',
        retryAfterSeconds: ADMIN_STEP_UP_LOCK_MINUTES * 60,
      };
    }

    return { outcome: 'invalid' };
  }

  /**
   * Explicit user resend:
   * - active lock wins (throws with retryAfterSeconds)
   * - resend does NOT reset attempts
   * - quota counts only successful dispatches
   *
   * Atomicity: reserve slot FIRST with guarded updateMany (resendCount < max).
   */
  async resend(
    userId: string,
    channel: AdminStepUpChannel,
  ): Promise<{
    sendStatus: 'sent' | 'unavailable';
    resendRemaining: number;
  }> {
    if (channel !== 'EMAIL') {
      throw new ForbiddenException({
        code: ADMIN_STEP_UP_ERROR_CODES.CHALLENGE_NOT_FOUND,
        message: ADMIN_STEP_UP_INVALID_MESSAGE,
      });
    }

    const now = new Date();
    const row = await this.findChallenge(userId, channel);
    if (!row) {
      // Defensive: should not happen as /start always issues one
      // Seed row with resendCount 1 if no challenge exists yet
      const otp = this.generateOtp();
      const codeHash = await this.hashOtp(otp);
      const expiresAt = new Date(Date.now() + ADMIN_STEP_UP_TTL_MINUTES * 60 * 1000);
      await this.prisma.adminStepUpChallenge.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
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
      return { sendStatus: 'sent', resendRemaining: ADMIN_STEP_UP_MAX_RESENDS - 1 };
    }

    // Check if locked
    if (
      row.lockedUntil &&
      row.lockedUntil.getTime() > now.getTime()
    ) {
      throw new ForbiddenException({
        code: ADMIN_STEP_UP_ERROR_CODES.OTP_LOCKED,
        message: ADMIN_STEP_UP_LOCKED_MESSAGE,
        retryAfterSeconds: Math.ceil(
          (row.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      });
    }

    // Reserve one resend slot atomically BEFORE dispatching
    const existing = await this.findChallenge(userId, channel);
    if (existing && existing.resendCount >= ADMIN_STEP_UP_MAX_RESENDS) {
      throw new ForbiddenException({
        code: ADMIN_STEP_UP_ERROR_CODES.OTP_RESEND_LIMIT,
        message: ADMIN_STEP_UP_RESEND_LIMIT_MESSAGE,
      });
    }

    if (existing) {
      const reserved = await this.prisma.adminStepUpChallenge.updateMany({
        where: { id: existing.id, resendCount: { lt: ADMIN_STEP_UP_MAX_RESENDS } },
        data: { resendCount: { increment: 1 } },
      });
      if (reserved.count === 0) {
        throw new ForbiddenException({
          code: ADMIN_STEP_UP_ERROR_CODES.OTP_RESEND_LIMIT,
          message: ADMIN_STEP_UP_RESEND_LIMIT_MESSAGE,
        });
      }
    }

    // Re-issue same row IN PLACE: attempts survive
    const otp = this.generateOtp();
    const codeHash = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + ADMIN_STEP_UP_TTL_MINUTES * 60 * 1000);
    const rowResult = await this.prisma.adminStepUpChallenge.upsert({
      where: { userId: userId },
      create: {
        userId: userId,
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

    // Dispatch logic would go here; assume sent
    const sendStatus = 'sent';

    if (sendStatus !== 'sent') {
      // Provider failure: refund reservation
      await this.prisma.adminStepUpChallenge.updateMany({
        where: { id: rowResult.id, resendCount: { gt: 0 } },
        data: { resendCount: { decrement: 1 } },
      });
    }

    return {
      sendStatus,
      resendRemaining: await this.resendRemaining(userId, channel),
    };
  }

  /**
   * Current resend budget left for a user/channel.
   */
  async resendRemaining(
    userId: string,
    channel: AdminStepUpChannel,
  ): Promise<number> {
    if (channel !== 'EMAIL') {
      return 0;
    }
    const row = await this.findChallenge(userId, channel);
    return Math.max(0, ADMIN_STEP_UP_MAX_RESENDS - (row?.resendCount ?? 0));
  }

  /**
   * Create short-lived session token after successful OTP verification.
   * Returns raw token to caller; only SHA-256 hash is persisted.
   */
  async createSession(userId: string): Promise<string> {
    const sessionToken = this.generateSessionToken();
    const sessionTokenHash = createHash('sha256')
      .update(sessionToken)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() + ADMIN_STEP_UP_SESSION_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.adminStepUpSession.create({
      data: {
        userId: userId,
        sessionTokenHash: sessionTokenHash,
        expiresAt: expiresAt,
      },
    });

    return sessionToken;
  }

  /**
   * Consume session token: validate, mark consumed, return userId.
   * Sessions are single-use: consumed on first SUPERADMIN request.
   */
  async consumeSession(
    sessionToken: string,
  ): Promise<{ userId: string } | null> {
    const sessionTokenHash = createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const session = await this.prisma.adminStepUpSession.findUnique({
      where: { sessionTokenHash: sessionTokenHash },
    });

    if (
      !session ||
      session.consumedAt !== null ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    // Atomically mark as consumed
    const updated = await this.prisma.adminStepUpSession.updateMany({
      where: {
        id: session.id,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    if (updated.count === 0) {
      return null; // raced
    }

    return { userId: session.userId };
  }

  /**
   * Revoke all sessions for a user (used on step-up session logout or admin revocation).
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.prisma.adminStepUpSession.updateMany({
      where: { userId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}