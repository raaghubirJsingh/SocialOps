/**
 * Registration Phase v1.0 constants (human-approved values).
 *
 * All registration lifecycle, lock, reminder, and rate-limit constants
 * are frozen with exact approved numbers; operator .env overrides are
 * deliberately prohibited.
 */

/** OTP validity: 5 minutes (L4). */
export const OTP_TTL_MINUTES = 5;

/** Maximum wrong OTP attempts before the temporary lock (L4). */
export const OTP_MAX_WRONG_ATTEMPTS = 3;

/** Temporary verification lock after 3 wrong attempts: 1 hour (L4). */
export const OTP_LOCK_MINUTES = 60;

/** Maximum SUCCESSFUL resends per channel (L4/OPEN-5). */
export const OTP_MAX_RESENDS = 3;

/** Pending registration lifetime: 72 hours exactly (OPEN-7). */
export const PENDING_TTL_HOURS = 72;

/** Reminder offsets from createdAt (OPEN-7): +24h, +48h, +66h (+72h expiry). */
export const REMINDER_OFFSETS_HOURS = {
  1: 24,
  2: 48,
  3: 66,
} as const;

export type ReminderDay = 1 | 2 | 3;

/**
 * Redis rate-limit budgets (OPEN-3/L15 - EXACT approved numbers).
 * Window is 15 minutes = 900 seconds for every registration operation.
 * These apply ONLY to the five registration operations; existing
 * login/refresh/logout/employee endpoints are deliberately untouched.
 */
export const REGISTRATION_RATE_WINDOW_SECONDS = 900;

export const REGISTRATION_RATE_LIMITS = {
  start: 5,
  otpVerify: 10,
  otpResend: 6,
  password: 5,
  resume: 10,
} as const;

/**
 * Controlled Recovery locked values (Section 23).
 *
 * These govern the atomic claim/lease/abandonment lifecycle for reminder
 * event processing. No operator .env overrides are permitted.
 *
 *   - Claim lease (10 min): a processor holds exclusive rights to
 *     process a reminder event for this duration.
 *   - Abandonment timeout (30 min): if a claim is not completed within
 *     this window from claimedAt, it is considered abandoned and may be
 *     re-claimed by another processor.
 *   - Reconciliation window (15 min): after delivery, unknown provider
 *     delivery states may be reconciled within this window.
 */
export const REMINDER_CLAIM_LEASE_MINUTES = 10;
export const REMINDER_ABANDONMENT_TIMEOUT_MINUTES = 30;
export const REMINDER_RECONCILIATION_WINDOW_MINUTES = 15;

/** Uniform message for any unknown/expired/rotated pending registration. */
export const PENDING_NOT_FOUND_MESSAGE = 'Registration not found or has expired';

/** Explicit duplicate-User message (L7 - matches legacy register behavior). */
export const EMAIL_IN_USE_MESSAGE = 'Email already in use';
