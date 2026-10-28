/**
 * SuperAdmin step-up OTP constants (Decision 020 §6).
 *
 * All values are frozen. Operator .env overrides are deliberately
 * prohibited: the step-up flow is a security control, not a tunable
 * parameter, and its thresholds must be auditable in code review.
 */

/** OTP validity: 5 minutes (mirrors RegistrationOtp, L4). */
export const ADMIN_STEP_UP_TTL_MINUTES = 5;

/** Maximum wrong OTP attempts before the temporary lock (mirrors L4). */
export const ADMIN_STEP_UP_MAX_WRONG_ATTEMPTS = 3;

/** Temporary verification lock after 3 wrong attempts: 1 minute (mirrors L4). */
export const ADMIN_STEP_UP_LOCK_MINUTES = 1;

/** Maximum SUCCESSFUL resends (mirrors L4/OPEN-5). */
export const ADMIN_STEP_UP_MAX_RESENDS = 3;

/** Step-up session lifetime: 15 minutes. Short by design - the session is
 *  consumed on the first SUPERADMIN request, so this is an upper bound on
 *  replay exposure, not a target idle lifetime. */
export const ADMIN_STEP_UP_SESSION_TTL_MINUTES = 15;

/** Uniform message for any unknown/expired/rotated challenge. */
export const ADMIN_STEP_UP_INVALID_MESSAGE = 'Invalid or expired code';

/** Uniform message for a locked challenge. */
export const ADMIN_STEP_UP_LOCKED_MESSAGE = 'Verification temporarily locked';

/** Uniform message for a resend limit reached. */
export const ADMIN_STEP_UP_RESEND_LIMIT_MESSAGE = 'Resend limit reached';

/** Uniform message for an unknown/expired/consumed step-up session. */
export const ADMIN_STEP_UP_SESSION_INVALID_MESSAGE = 'Step-up session invalid or expired';

/** Stable machine-readable codes for the step-up API. */
export const ADMIN_STEP_UP_ERROR_CODES = Object.freeze({
  OTP_INVALID: 'ADMIN_STEP_UP_OTP_INVALID',
  OTP_LOCKED: 'ADMIN_STEP_UP_OTP_LOCKED',
  OTP_RESEND_LIMIT: 'ADMIN_STEP_UP_OTP_RESEND_LIMIT',
  SESSION_INVALID: 'ADMIN_STEP_UP_SESSION_INVALID',
  SESSION_CONSUMED: 'ADMIN_STEP_UP_SESSION_CONSUMED',
  NOT_ADMIN: 'SOCIALOPS_ADMIN_REQUIRED',
  CHALLENGE_NOT_FOUND: 'ADMIN_STEP_UP_CHALLENGE_NOT_FOUND',
} as const);

export type AdminStepUpErrorCode =
  (typeof ADMIN_STEP_UP_ERROR_CODES)[keyof typeof ADMIN_STEP_UP_ERROR_CODES];