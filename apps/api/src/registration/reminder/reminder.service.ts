import { Inject, Injectable } from '@nestjs/common';

import type { PendingRegistration } from '@prisma/client';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';

import type { ReminderDay } from '../constants/registration.constants.js';
import {
  REMINDER_ABANDONMENT_TIMEOUT_MINUTES,
  REMINDER_CLAIM_LEASE_MINUTES,
  REMINDER_RECONCILIATION_WINDOW_MINUTES,
} from '../constants/registration.constants.js';
import {
  EMAIL_VERIFICATION_PROVIDER,
  ProviderUnavailableError,
  WHATSAPP_VERIFICATION_PROVIDER,
} from '../providers/verification-provider.port.js';
import type { VerificationProvider } from '../providers/verification-provider.port.js';
import {
  PendingRegistrationService,
  generateResumeToken,
  hashResumeToken,
} from '../pending-registration.service.js';
import {
  buildReminderMessage,
  buildResumeUrl,
} from './reminder-content.builder.js';
import type { ReminderChannelState, ReminderDayState } from './reminder.types.js';
import {
  isDayClaimed,
  isDayProcessed,
  parseReminderState,
  reminderKey,
} from './reminder.types.js';

/** Section 23 time constants in milliseconds (derived from locked minutes). */
const CLAIM_LEASE_MS = REMINDER_CLAIM_LEASE_MINUTES * 60 * 1000;
const ABANDONMENT_TIMEOUT_MS = REMINDER_ABANDONMENT_TIMEOUT_MINUTES * 60 * 1000;
const RECONCILIATION_WINDOW_MS = REMINDER_RECONCILIATION_WINDOW_MINUTES * 60 * 1000;

/**
 * Processor identity used when the caller does not supply one (tests and
 * the current single-process path). The approved BullMQ worker later
 * passes its own stable worker identity so claims are distinguishable
 * across processes.
 */
export const DEFAULT_REMINDER_PROCESSOR_ID = 'reminder-processor';

export interface ReminderClaimResult {
  outcome: 'claimed' | 'skipped';
  reason?: 'not_found' | 'expired' | 'already_processed' | 'already_claimed';
}

export interface ReminderProcessResult {
  outcome: 'processed' | 'skipped';
  reason?: 'not_found' | 'expired' | 'already_processed' | 'already_claimed';
  /** True only when THIS call performed the single rotation. */
  rotated: boolean;
  /** Present only when rotated=true (same-process delivery context). */
  rawToken?: string;
  channels?: { email: ReminderChannelState; whatsapp: ReminderChannelState };
}

export interface ReminderRetryResult {
  outcome: 'retried' | 'noop' | 'skipped';
  reason?: 'not_found' | 'expired' | 'not_processed' | 'stale_token';
  channel?: ReminderChannelState;
}

export interface ReminderReconcileResult {
  outcome: 'reconciled' | 'noop' | 'skipped';
  reason?:
    | 'not_found'
    | 'expired'
    | 'not_processed'
    | 'window_closed'
    | 'already_sent'
    | 'stale_token';
  channel?: ReminderChannelState;
}

type ChannelField = 'email' | 'whatsapp';

type DayKey = 'day1' | 'day2' | 'day3';

/** First name only - reminders never carry the full record. */
function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'there';
}

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pendingService: PendingRegistrationService,
    @Inject(EMAIL_VERIFICATION_PROVIDER)
    private readonly emailProvider: VerificationProvider,
    @Inject(WHATSAPP_VERIFICATION_PROVIDER)
    private readonly whatsappProvider: VerificationProvider,
  ) {}

  private providerFor(field: ChannelField): VerificationProvider {
    return field === 'email' ? this.emailProvider : this.whatsappProvider;
  }

  private destinationFor(
    pending: Pick<PendingRegistration, 'email' | 'phone'>,
    field: ChannelField,
  ): string {
    return field === 'email' ? pending.email : pending.phone;
  }

  /**
   * Acquire an exclusive claim on a reminder event (Section 23).
   *
   * Atomicity: the pending row is row-locked (SELECT ... FOR UPDATE) for
   * the whole read-check-write, so two concurrent processors can never
   * both observe "unclaimed" and both claim. The lock is released at
   * commit and is NEVER held across provider I/O.
   *
   * Claim granted when: the pending exists, is not expired, is not
   * already processed, and no active non-abandoned claim is held by a
   * DIFFERENT processor. No credential rotation occurs at claim time.
   */
  async claimReminderEvent(
    pendingId: string,
    day: ReminderDay,
    processorId: string = DEFAULT_REMINDER_PROCESSOR_ID,
    now: Date = new Date(),
  ): Promise<ReminderClaimResult> {
    return this.prisma.$transaction(async (tx): Promise<ReminderClaimResult> => {
      // Serialise claimers for this pending row (repo-wide lock pattern,
      // see content/change-request.service.ts).
      await tx.$queryRaw`
        SELECT "id" FROM "PendingRegistration"
        WHERE "id" = ${pendingId}::uuid
        FOR UPDATE
      `;

      const pending = await tx.pendingRegistration.findUnique({
        where: { id: pendingId },
      });
      if (!pending) return { outcome: 'skipped', reason: 'not_found' };
      if (this.pendingService.isExpired(pending, now)) {
        // Lazy expiry hard-delete INSIDE the lock: going through
        // PendingRegistrationService here would use a second connection
        // and block on the row lock this transaction already holds.
        // FK cascades (OTP rows, temp sensitive data) still apply.
        await tx.pendingRegistration.deleteMany({ where: { id: pending.id } });
        return { outcome: 'skipped', reason: 'expired' };
      }

      const state = parseReminderState(pending.reminderState);
      const key = reminderKey(day);
      const dayState = state[key];
      if (isDayProcessed(dayState)) {
        return { outcome: 'skipped', reason: 'already_processed' };
      }
      if (isDayClaimed(dayState, now, CLAIM_LEASE_MS, ABANDONMENT_TIMEOUT_MS)) {
        if (dayState?.claimedBy !== processorId) {
          return { outcome: 'skipped', reason: 'already_claimed' };
        }
        // Same processor re-claiming: idempotent refresh allowed.
      }

      const claimedDayState: ReminderDayState = {
        ...dayState,
        claimedAt: now.toISOString(),
        leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
        claimedBy: processorId,
      };
      await tx.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          reminderState: { ...state, [key]: claimedDayState } as unknown as
            Prisma.InputJsonValue,
        },
      });
      return { outcome: 'claimed' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /**
   * Process one reminder event end to end under the Section 23 lifecycle:
   *
   *   claim (atomic) -> rotate the SINGLE credential -> deliver on both
   *   independent channels -> mark processed + open reconciliation window
   *
   * processedAt is written ONLY after the delivery attempts complete, so a
   * processor that dies mid-flight leaves the event claimable again (once
   * its claim is abandoned at 30 min) instead of permanently stuck.
   * createdAt / expiresAt are never modified.
   */
  async processReminderEvent(
    pendingId: string,
    day: ReminderDay,
    processorId: string = DEFAULT_REMINDER_PROCESSOR_ID,
    now: Date = new Date(),
  ): Promise<ReminderProcessResult> {
    const claim = await this.claimReminderEvent(pendingId, day, processorId, now);
    if (claim.outcome === 'skipped') {
      return { outcome: 'skipped', reason: claim.reason, rotated: false };
    }

    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id: pendingId },
    });
    if (!pending) {
      return { outcome: 'skipped', reason: 'not_found', rotated: false };
    }
    if (this.pendingService.isExpired(pending, now)) {
      await this.pendingService.deleteExpired(pending);
      return { outcome: 'skipped', reason: 'expired', rotated: false };
    }

    const state = parseReminderState(pending.reminderState);
    const key = reminderKey(day);
    if (isDayProcessed(state[key])) {
      // Lost the race between claim and re-read: never rotate twice (D1-A).
      return { outcome: 'skipped', reason: 'already_processed', rotated: false };
    }

    // D1-A: rotate the SINGLE credential, hash-only, in place.
    const rawToken = generateResumeToken();
    await this.prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: {
        resumeTokenHash: hashResumeToken(rawToken),
        // createdAt / expiresAt intentionally absent: never modified.
      },
    });

    const message = buildReminderMessage({
      day,
      to: pending.email,
      firstName: firstNameOf(pending.fullName),
      resumeUrl: buildResumeUrl(rawToken),
      expiresAt: pending.expiresAt,
    });

    // OPEN-6B: the channels are independent - one failure never blocks the
    // other, and a delivery failure never causes an extra rotation.
    const emailChannel = await this.deliver(pending, 'email', message, key);
    const whatsappChannel = await this.deliver(pending, 'whatsapp', message, key);

    // Completion marker LAST and unconditional: the messages have already
    // left, so recording processedAt is what stops a later claimant from
    // sending the SAME event a second time.
    await this.completeReminderEvent(pending.id, key, now);

    return {
      outcome: 'processed',
      rotated: true,
      rawToken,
      channels: { email: emailChannel, whatsapp: whatsappChannel },
    };
  }

  /**
   * Reconcile one channel whose recorded delivery state is not 'sent',
   * inside the Section 23 reconciliation window (15 min from completion).
   *
   * Honest limitation: the locked provider port exposes ONLY send() - there
   * is no delivery-status query - so reconciliation can only RE-ATTEMPT
   * delivery, it can never ask the vendor what actually happened. A channel
   * already recorded 'sent' is therefore never re-notified (noop): this
   * biases toward silence over a duplicate message.
   *
   * Outside the window nothing is ever re-sent, so a late reconciliation
   * cannot notify a registration that has already completed or expired.
   * Never rotates (D1-A): the caller must present the CURRENT raw token.
   */
  async reconcileReminderDelivery(
    pendingId: string,
    day: ReminderDay,
    field: ChannelField,
    rawToken: string,
    now: Date = new Date(),
  ): Promise<ReminderReconcileResult> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id: pendingId },
    });
    if (!pending) return { outcome: 'skipped', reason: 'not_found' };
    if (this.pendingService.isExpired(pending, now)) {
      await this.pendingService.deleteExpired(pending);
      return { outcome: 'skipped', reason: 'expired' };
    }

    const dayState = parseReminderState(pending.reminderState)[reminderKey(day)];
    if (!isDayProcessed(dayState)) {
      return { outcome: 'skipped', reason: 'not_processed' };
    }
    const reconcileUntil = dayState?.reconcileUntil;
    if (!reconcileUntil || now.getTime() >= new Date(reconcileUntil).getTime()) {
      return { outcome: 'skipped', reason: 'window_closed' };
    }

    // The window is open: reuse the validated retry path (it re-checks the
    // token hash and refuses a channel that already recorded 'sent').
    const retry = await this.retryReminderChannel(pendingId, day, field, rawToken);
    if (retry.outcome === 'retried') {
      return { outcome: 'reconciled', channel: retry.channel };
    }
    if (retry.outcome === 'noop') {
      return { outcome: 'noop', reason: 'already_sent', channel: retry.channel };
    }
    return { outcome: 'skipped', reason: retry.reason ?? 'not_processed' };
  }

  /**
   * Retry a FAILED channel of an ALREADY-processed reminder event.
   * Uses the CURRENT token (raw must hash-match the stored hash) and
   * NEVER rotates - provider failure creates no additional token and a
   * retry of the same event reuses the current token (D1-A).
   * Internal: for tests now, the approved worker later; NOT routed as
   * an HTTP endpoint in this phase (OPEN-8).
   */
  async retryReminderChannel(
    pendingId: string,
    day: ReminderDay,
    field: ChannelField,
    rawToken: string,
  ): Promise<ReminderRetryResult> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id: pendingId },
    });
    if (!pending) {
      return { outcome: 'skipped', reason: 'not_found' };
    }
    if (this.pendingService.isExpired(pending)) {
      await this.pendingService.deleteExpired(pending);
      return { outcome: 'skipped', reason: 'expired' };
    }

    const state = parseReminderState(pending.reminderState);
    const key = reminderKey(day);
    const dayState = state[key];
    if (!dayState || !isDayProcessed(dayState)) {
      // A claim WITHOUT completion is not a retryable event (Section 23):
      // processedAt is the only proof the event was actually processed.
      return { outcome: 'skipped', reason: 'not_processed' };
    }
    if (hashResumeToken(rawToken) !== pending.resumeTokenHash) {
      return { outcome: 'skipped', reason: 'stale_token' };
    }
    if (dayState[field]?.status === 'sent') {
      return { outcome: 'noop', channel: dayState[field] };
    }

    const message = buildReminderMessage({
      day,
      to: pending.email,
      firstName: firstNameOf(pending.fullName),
      resumeUrl: buildResumeUrl(rawToken),
      expiresAt: pending.expiresAt,
    });
    const channel = await this.deliver(pending, field, message, key);
    return { outcome: 'retried', channel };
  }

  /** Independent per-channel delivery (OPEN-6B) + state recording. */
  private async deliver(
    pending: PendingRegistration,
    field: ChannelField,
    message: { subject: string; body: string },
    key: DayKey,
  ): Promise<ReminderChannelState> {
    let channelState: ReminderChannelState;
    try {
      const provider = this.providerFor(field);
      if (!provider.isAvailable()) {
        throw new ProviderUnavailableError(
          field === 'email' ? 'EMAIL' : 'WHATSAPP',
          'unavailable',
        );
      }
      await provider.send({
        to: this.destinationFor(pending, field),
        subject: message.subject,
        body: message.body,
      });
      channelState = { status: 'sent', at: new Date().toISOString() };
    } catch {
      // Generic error text only: never leak provider internals/logs.
      channelState = {
        status: 'failed',
        at: new Date().toISOString(),
        error: 'provider unavailable',
      };
    }

    // Locked merge so the two independent channels never clobber each
    // other's state (OPEN-6B: one failure never blocks the other).
    await this.mergeDayState(pending.id, key, (currentDay) => ({
      ...currentDay,
      [field]: channelState,
    }));

    return channelState;
  }

  /**
   * Record the Section 23 completion marker for one event and open the
   * reconciliation window. Kept separate from the rotation write so an
   * interrupted processor leaves the event claimable rather than permanently
   * marked done. An already-recorded processedAt is preserved (idempotent).
   */
  private async completeReminderEvent(
    pendingId: string,
    key: DayKey,
    now: Date,
  ): Promise<void> {
    await this.mergeDayState(pendingId, key, (dayState) => {
      const processedAt = dayState.processedAt ?? now.toISOString();
      return {
        ...dayState,
        processedAt,
        reconcileUntil: new Date(
          new Date(processedAt).getTime() + RECONCILIATION_WINDOW_MS,
        ).toISOString(),
      };
    });
  }

  /**
   * Locked read-modify-write of ONE day's reminder state. The row lock
   * serialises concurrent writers, so the two per-channel writes (OPEN-6B)
   * and the completion marker can never overwrite each other.
   */
  private async mergeDayState(
    pendingId: string,
    key: DayKey,
    mutate: (dayState: ReminderDayState) => ReminderDayState,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx): Promise<void> => {
      await tx.$queryRaw`
        SELECT "id" FROM "PendingRegistration"
        WHERE "id" = ${pendingId}::uuid
        FOR UPDATE
      `;
      const fresh = await tx.pendingRegistration.findUnique({
        where: { id: pendingId },
      });
      if (!fresh) return; // Row expired / deleted concurrently.
      const state = parseReminderState(fresh.reminderState);
      await tx.pendingRegistration.update({
        where: { id: pendingId },
        data: {
          reminderState: {
            ...state,
            [key]: mutate(state[key] ?? {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
