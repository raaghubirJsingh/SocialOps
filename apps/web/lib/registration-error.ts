import { ApiError } from './api';
import { describeApiError } from './api-error-messages';

/**
 * Stable machine-readable codes emitted by the registration API. Mirrored
 * from `apps/api/src/registration/constants/registration.constants.ts` so the
 * frontend can key on them directly instead of parsing human-readable text.
 */
const REGISTRATION_ERROR_CODES = Object.freeze({
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  OTP_LOCKED: 'OTP_LOCKED',
  OTP_RESEND_LIMIT: 'OTP_RESEND_LIMIT',
} as const);

/**
 * PURE error mapping for the staged registration chat.
 *
 * No React, no network, no storage - same discipline as
 * `lib/registration-conversation.ts` and `lib/raw-data-request-state.ts`, so
 * this is directly unit-testable under the existing node-environment Jest
 * config (no jsdom, no testing-library needed).
 *
 * WHY THIS EXISTS INSTEAD OF `describeApiError` ALONE:
 * the staged registration endpoints answer with `{ statusCode, error, message }`
 * and a `details[]` array (ZodValidationPipe) - they carry NO `code` field, so
 * `CODE_MESSAGES` can never key on them. `describeApiError` is still used below
 * as a fallback whenever a `code` IS present, so both apps stay on one mapper
 * wherever the shared contract allows it.
 *
 * SECURITY / UX CONTRACT (enforced by the unit tests):
 *   - Never surface `err.message`, a stack trace, a status code, a raw
 *     `details[]` entry, or any backend-internal wording.
 *   - Never reveal MORE than the backend already returns. The "email already
 *     registered" line restates the existing 403 exactly; it does not turn a
 *     400/500 into a registration oracle.
 */

/** User-safe, bilingual copy. Matches the Devanagari+English style of the chat. */
export const REGISTRATION_ERROR_MESSAGES = Object.freeze({
  connection:
    'हमें कनेक्शन में समस्या हुई — कृपया दोबारा कोशिश करें। (We hit a connection problem — please try again.)',
  rateLimited:
    'बहुत अधिक कोशिशें — कृपया कुछ देर बाद कोशिश करें। (Too many attempts — please wait and try again.)',
  expired:
    'यह registration समाप्त हो चुका है — कृपया दोबारा शुरू करें। (This registration has expired or was completed. Please start again.)',
  /**
   * The identity step is special: a 404 here does NOT mean "your session
   * expired", it means an UNFINISHED pending registration already owns this
   * email (the committed-then-failed case). Saying "expired" would be a lie
   * and would hide the real remedy, which is "wait, or use another email".
   */
  identityEmailPending:
    'इस email की registration पहले से चल रही है या अधूरी रह गई है — कृपया कुछ देर बाद कोशिश करें या दूसरा email इस्तेमाल करें। (A registration for this email is already in progress or unfinished — try again later or use a different email.)',
  alreadyInProgress:
    'इस email की registration पहले से चल रही है। (A registration for this email is already in progress.)',
  emailAlreadyRegistered:
    'यह email पहले से registered है — कृपया login करें। (This email is already registered — please sign in.)',
  invalidFullName:
    'कृपया अपना नाम सही तरीके से लिखें। (Please enter your name correctly.)',
  invalidPhone:
    'WhatsApp mobile number सही नहीं है। (That WhatsApp mobile number is not valid.)',
  invalidEmail:
    'Email address सही नहीं है। (That email address is not valid.)',
  invalidGeneric:
    'कुछ जानकारी सही नहीं है — कृपया दोबारा देखें। (Some details are not valid — please review them.)',
  /**
   * OTP verification is temporarily locked (3 wrong attempts -> 1-hour
   * lock). Distinct from the rate-limit line because it is a verification
   * state, not a request-budget state, and it names the remedy.
   */
  otpLocked:
    'Verification is temporarily locked. Please wait and try again. (Verification is temporarily locked — please wait and try again.)',
});

/**
 * The ONLY field paths whose detail may ever influence copy.
 *
 * This is an ALLOW-LIST, not a denylist: anything outside it (an unknown Zod
 * path, a nested key, an internal column name) falls through to the generic
 * line, so echoing the server can never leak internal field naming.
 */
const FIELD_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  fullName: REGISTRATION_ERROR_MESSAGES.invalidFullName,
  phone: REGISTRATION_ERROR_MESSAGES.invalidPhone,
  email: REGISTRATION_ERROR_MESSAGES.invalidEmail,
});

/**
 * Which part of the flow failed.
 *
 * `identity` = the POST /start identity submission; `lifecycle` = every later
 * staged call (otp/verify, otp/resend, password, resume). The two differ ONLY
 * for a 404, which means opposite things in each place.
 */
export type RegistrationErrorContext = 'identity' | 'lifecycle';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function retryAfterOf(body: Record<string, unknown> | null): number | null {
  const raw = body?.['retryAfterSeconds'];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** 400: map the first ALLOW-LISTED field error; never echo raw details. */
function describeValidationError(body: Record<string, unknown> | null): string {
  const details = body?.['details'];
  if (Array.isArray(details)) {
    for (const entry of details) {
      const record = asRecord(entry);
      if (!record) continue;
      const path = record['path'];
      if (typeof path !== 'string') continue;
      const mapped = FIELD_MESSAGES[path];
      if (mapped) return mapped;
    }
  }
  return REGISTRATION_ERROR_MESSAGES.invalidGeneric;
}
/**
 * The single, safe mapper for every failure in the registration chat.
 *
 * A non-`ApiError` (a `fetch` TypeError from a down/restarting API, an
 * aborted stream, or a client-side exception on a malformed 2xx body) is
 * reported as a connection problem - never as `err.message`.
 */
export function describeRegistrationError(
  err: unknown,
  context: RegistrationErrorContext = 'lifecycle',
): string {
  if (!(err instanceof ApiError)) {
    // Network failure, aborted request, or a shape error on a 2xx response.
    return REGISTRATION_ERROR_MESSAGES.connection;
  }

  const body = asRecord(err.body);
  const status = err.status;
  const retryAfter = retryAfterOf(body);

  // Rate limiting arrives as 429, or as a 403 carrying retryAfterSeconds.
  // The OTP lock is ALSO a 403 with retryAfterSeconds, but it is a distinct,
  // recoverable verification state - say so instead of the rate-limit line.
  // The resend limit is a 403 with retryAfterSeconds too, and it is neither a
  // rate-limit nor a lock: surface it as the generic line so the user is not
  // told to "wait and try again" by a budget that has nothing to do with
  // request throttling.
  if (status === 429 || (status === 403 && retryAfter !== null)) {
    if (body?.['code'] === REGISTRATION_ERROR_CODES.OTP_LOCKED) {
      return REGISTRATION_ERROR_MESSAGES.otpLocked;
    }
    if (body?.['code'] === REGISTRATION_ERROR_CODES.OTP_RESEND_LIMIT) {
      return REGISTRATION_ERROR_MESSAGES.invalidGeneric;
    }
    return retryAfter !== null
      ? `${REGISTRATION_ERROR_MESSAGES.rateLimited} (${retryAfter}s)`
      : REGISTRATION_ERROR_MESSAGES.rateLimited;
  }

  if (status === 404) {
    return context === 'identity'
      ? REGISTRATION_ERROR_MESSAGES.identityEmailPending
      : REGISTRATION_ERROR_MESSAGES.expired;
  }

  // 409 with the backend-controlled `code` EXPRESS duplicate-email: the
  // identity step (POST /start) answers 409 + code "EMAIL_IN_USE", and the
  // password step answers the same code for the Prisma P2002 race. A generic
  // 409 (no code) is something else (e.g. a transient resource conflict).
  if (status === 409) {
    return body?.['code'] === 'EMAIL_IN_USE'
      ? REGISTRATION_ERROR_MESSAGES.emailAlreadyRegistered
      : REGISTRATION_ERROR_MESSAGES.alreadyInProgress;
  }

  if (status === 400) {
    return describeValidationError(body);
  }

  // A 403 WITHOUT retryAfterSeconds is a lifecycle failure: wrong/expired OTP
  // (no code), or an incomplete gate (e.g. "both verifications must be
  // completed"). The OTP_LOCKED / OTP_RESEND_LIMIT codes always carry
  // retryAfterSeconds, so they are handled above and never reach here.
  if (status === 403) {
    return REGISTRATION_ERROR_MESSAGES.invalidGeneric;
  }

  // Reuse the shared app-wide mapper whenever the backend sends a `code` it
  // already knows; otherwise fall back to the safe generic line (5xx, and any
  // shape we have not anticipated). The registration OTP codes
  // (OTP_LOCKED / OTP_RESEND_LIMIT) always carry retryAfterSeconds, so they
  // are resolved above and never reach this fallback.
  const code = body?.['code'];
  if (typeof code === 'string' && code.length > 0) {
    const shared = describeApiError(err, '');
    if (typeof shared === 'string' && shared.length > 0) return shared;
  }

  return REGISTRATION_ERROR_MESSAGES.connection;
}