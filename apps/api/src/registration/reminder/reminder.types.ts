/**
 * Reminder event state types (OPEN-6B/OPEN-7 + D1-A + Section 23).
 *
 * Stored as JSON on PendingRegistration.reminderState:
 *   { day1?: ReminderDayState, day2?: ReminderDayState, day3?: ReminderDayState }
 *
 * Section 23 Controlled Recovery:
 *   - claimedAt / leaseExpiresAt / claimedBy: atomic claim lease (10 min)
 *   - reconcileUntil: post-delivery reconciliation window (15 min)
 *   - processedAt: set ONLY after successful processing completion
 *   - Abandonment timeout: 30 min from claimedAt (checked at claim time)
 *
 * Dedupe guard: a day's `processedAt` being set means the event was
 * FULLY PROCESSED. A claim alone (without processedAt) does NOT prevent
 * re-processing after the claim expires or is abandoned.
 */

export interface ReminderChannelState {
  status: 'sent' | 'failed';
  at: string;
  error?: string;
}

export interface ReminderDayState {
  /**
   * Set exactly once, on first successful processing of this event.
   * Optional: present only after processing completes (not at claim time).
   * The dedupe guard: when set, no further processing is permitted (D1-A).
   */
  processedAt?: string;
  /** Claim acquisition timestamp (Section 23). */
  claimedAt?: string;
  /** When the claim lease expires (Section 23: 10 min from claimedAt). */
  leaseExpiresAt?: string;
  /** Identifier of the processor that claimed this event. */
  claimedBy?: string;
  /**
   * Until when unknown provider delivery states may be reconciled
   * (Section 23: 15 min from delivery completion).
   */
  reconcileUntil?: string;
  email?: ReminderChannelState;
  whatsapp?: ReminderChannelState;
}

export interface ReminderState {
  day1?: ReminderDayState;
  day2?: ReminderDayState;
  day3?: ReminderDayState;
}

export function reminderKey(day: 1 | 2 | 3): 'day1' | 'day2' | 'day3' {
  return (`day${day}`) as 'day1' | 'day2' | 'day3';
}

export function parseReminderState(value: unknown): ReminderState {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ReminderState;
  }
  return {};
}

/**
 * Whether a day's event is fully processed (Section 23 dedupe guard).
 * Only `processedAt` counts — a claim without completion does not.
 */
export function isDayProcessed(dayState: ReminderDayState | undefined): boolean {
  return !!dayState?.processedAt;
}

/**
 * Whether a day's event has an active, non-expired, non-abandoned claim
 * (Section 23).
 *
 * Active claim = claimedAt is set AND:
 *   - lease has NOT expired (within 10 min of claimedAt), OR
 *   - abandonment timeout has NOT passed (within 30 min of claimedAt)
 *
 * Between lease expiry (10 min) and abandonment (30 min), the claim is
 * in a "cooling off" period: no other processor may claim it, but the
 * original claimant cannot extend it either.
 */
export function isDayClaimed(
  dayState: ReminderDayState | undefined,
  now: Date,
  claimLeaseMs: number,
  abandonmentTimeoutMs: number,
): boolean {
  if (!dayState?.claimedAt) return false;
  const claimedAt = new Date(dayState.claimedAt).getTime();
  const elapsed = now.getTime() - claimedAt;
  // Abandonment: 30 min from claim — after this, the claim is dead.
  if (elapsed >= abandonmentTimeoutMs) return false;
  // Lease: 10 min from claim — after this, the claim is expired but
  // not yet abandoned (cooling-off). Still blocks other claimants.
  if (elapsed >= claimLeaseMs) return true; // expired but not abandoned
  return true; // within lease
}
