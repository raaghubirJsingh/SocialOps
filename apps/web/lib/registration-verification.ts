import type {
  OtpResendResponse,
  OtpVerifyResponse,
  RegistrationResumeSnapshot,
  RegistrationSession,
  RegistrationStartResponse,
} from '@/types/auth';

/**
 * PURE verification-state derivation for the staged registration OTP panel.
 *
 * No React, no network, no storage - same discipline as
 * `lib/registration-conversation.ts` and `lib/registration-error.ts`, so
 * this is directly unit-testable under the existing node-environment Jest
 * config (no jsdom, no testing-library needed).
 *
 * WHY THIS EXISTS:
 * the OTP panel must treat the server's OtpVerifyResponse as authoritative.
 * Deriving the flags from local click history ("this channel OR I just
 * clicked it") leaves the UI on Pending after a resume/reload/double-submit
 * even when the server already holds the verification, because a 200's
 * `bothVerified: true` is then never consumed.
 */

/** Result of folding one verify response into the canonical session. */
export interface VerificationUpdate {
  session: RegistrationSession;
  advanceToPassword: boolean;
}

export function createRegistrationSessionFromStart(
  response: RegistrationStartResponse,
): RegistrationSession {
  return {
    resumeToken: response.resumeToken,
    stage:
      response.emailVerified && response.whatsappVerified
        ? 'password'
        : 'verification',
    expiresAt: response.expiresAt,
    maskedEmail: response.maskedEmail,
    maskedPhone: response.maskedPhone,
    accountType: response.accountType,
    clientType: response.clientType,
    emailVerified: response.emailVerified,
    whatsappVerified: response.whatsappVerified,
    sendStatus: response.sendStatus,
    resendRemaining: response.resendRemaining,
    lockedUntil: response.lockedUntil,
  };
}

export function createRegistrationSessionFromResume(
  resumeToken: string,
  snapshot: RegistrationResumeSnapshot,
): RegistrationSession {
  return {
    resumeToken,
    stage: snapshot.stage,
    expiresAt: snapshot.expiresAt,
    maskedEmail: snapshot.maskedEmail,
    maskedPhone: snapshot.maskedPhone,
    accountType: snapshot.accountType,
    clientType: snapshot.clientType,
    emailVerified: snapshot.emailVerified,
    whatsappVerified: snapshot.whatsappVerified,
    sendStatus: { email: null, whatsapp: null },
    resendRemaining: snapshot.resendRemaining,
    lockedUntil: snapshot.lockedUntil,
  };
}

/**
 * Fold one OtpVerifyResponse into the current registration session.
 *
 * The server is authoritative: the response channel's flag becomes
 * `response.verified` verbatim, and stage advancement follows
 * `response.bothVerified` - never a local OR-accumulator over click history.
 */
export function applyOtpVerifyResponse(
  current: RegistrationSession,
  response: OtpVerifyResponse,
): VerificationUpdate {
  const verifiedKey =
    response.channel === 'EMAIL' ? 'emailVerified' : 'whatsappVerified';
  return {
    session: {
      ...current,
      [verifiedKey]: response.verified,
      stage: response.bothVerified ? 'password' : 'verification',
    },
    advanceToPassword: response.bothVerified,
  };
}

export function applyOtpResendResponse(
  current: RegistrationSession,
  response: OtpResendResponse,
): RegistrationSession {
  const channel = response.channel === 'EMAIL' ? 'email' : 'whatsapp';
  const verifiedKey =
    response.channel === 'EMAIL' ? 'emailVerified' : 'whatsappVerified';
  const emailVerified =
    channel === 'email' && response.sendStatus === 'already_verified'
      ? true
      : current.emailVerified;
  const whatsappVerified =
    channel === 'whatsapp' && response.sendStatus === 'already_verified'
      ? true
      : current.whatsappVerified;

  return {
    ...current,
    [verifiedKey]: response.sendStatus === 'already_verified' ? true : current[verifiedKey],
    emailVerified,
    whatsappVerified,
    stage: emailVerified && whatsappVerified ? 'password' : current.stage,
    sendStatus: { ...current.sendStatus, [channel]: response.sendStatus },
    resendRemaining: {
      ...current.resendRemaining,
      [channel]: response.resendRemaining,
    },
  };
}

/**
 * Response-shape guard for POST /auth/registration/otp/verify.
 *
 * `apiFetch` performs NO runtime shape validation: an empty body parses to
 * `null` and a non-JSON body degrades to the raw text string. The caller
 * treats a malformed 2xx exactly like a dead API (the pure mapper's
 * connection line) instead of marking verification successful.
 */
export function isOtpVerifyResponse(value: unknown): value is OtpVerifyResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.channel === 'EMAIL' || record.channel === 'WHATSAPP') &&
    typeof record.verified === 'boolean' &&
    typeof record.bothVerified === 'boolean'
  );
}
