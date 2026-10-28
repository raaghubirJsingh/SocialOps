/**
 * Mandatory Login OTP constants (single-box login with email OTP).
 *
 * All values are frozen with exact approved numbers. No operator .env
 * overrides are permitted for the security-sensitive values.
 *
 *   - 6-digit numeric code, leading zero valid (stored as a string)
 *   - Argon2id hash only; raw OTP never persists, never appears in any
 *     API response, never logged outside the dev console
 *   - 5-minute challenge expiry; single use (usedAt)
 *   - max 3 wrong attempts -> 1-hour lock (never deletes the account)
 *   - resend does NOT reset the wrong-attempt count
 *   - max 3 SUCCESSFUL resends; provider-unavailable dispatch does not
 *     consume quota
 *   - 60-second resend cooldown: a resend within 60s of the last successful
 *     dispatch is rejected with 429 (rate limit, not quota)
 *   - after lock expiry: fresh challenge, attempts = 0, no quota use
 *   - wrong/expired/used are uniform; only the lock state is distinct
 */

/** OTP validity: 5 minutes (mirrors RegistrationOtp / AdminStepUpChallenge). */
export const LOGIN_OTP_TTL_MINUTES = 5;

/** Maximum wrong OTP attempts before the temporary lock. */
export const LOGIN_OTP_MAX_WRONG_ATTEMPTS = 3;

/** Temporary verification lock after 3 wrong attempts: 1 hour. */
export const LOGIN_OTP_LOCK_MINUTES = 60;

/** Maximum SUCCESSFUL resends. */
export const LOGIN_OTP_MAX_RESENDS = 3;

/** Resend cooldown: 60 seconds between OTP dispatches. */
export const LOGIN_OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Uniform message for any unknown/expired/rotated challenge. */
export const LOGIN_CHALLENGE_NOT_FOUND_MESSAGE =
  'No active login challenge for this user';

/** Uniform message for wrong/expired/used OTP. */
export const LOGIN_OTP_INVALID_MESSAGE = 'Invalid or expired code';

/** Message returned when the resend cooldown is active. */
export const LOGIN_OTP_RESEND_COOLDOWN_MESSAGE =
  'Please wait before requesting another code';

/** Message returned when the resend limit is reached. */
export const LOGIN_OTP_RESEND_LIMIT_MESSAGE = 'Resend limit reached';

/** Message returned when the challenge is locked. */
export const LOGIN_OTP_LOCKED_MESSAGE = 'Verification temporarily locked';

/** Stable machine-readable codes for the login OTP error contract. */
export const LOGIN_OTP_ERROR_CODES = Object.freeze({
  CHALLENGE_NOT_FOUND: 'LOGIN_CHALLENGE_NOT_FOUND',
  OTP_INVALID: 'LOGIN_OTP_INVALID',
  OTP_LOCKED: 'LOGIN_OTP_LOCKED',
  OTP_RESEND_COOLDOWN: 'LOGIN_OTP_RESEND_COOLDOWN',
  OTP_RESEND_LIMIT: 'LOGIN_OTP_RESEND_LIMIT',
} as const);

export type LoginOtpErrorCode =
  (typeof LOGIN_OTP_ERROR_CODES)[keyof typeof LOGIN_OTP_ERROR_CODES];