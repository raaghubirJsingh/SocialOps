import type {
  AdminStepUpChallengeRequest,
  AdminStepUpChallengeResponse,
  AdminStepUpResendRequest,
  AdminStepUpResendResponse,
  AdminStepUpVerifyRequest,
  AdminStepUpVerifyResponse,
  GenericStatusResponse,
  LogoutRequest,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  OtpResendRequest,
  OtpResendResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  RegisterEmployeeRequest,
  RegistrationCompleteResponse,
  RegistrationPasswordRequest,
  RegistrationResumeRequest,
  RegistrationResumeSnapshot,
  RegistrationStartRequest,
  RegistrationStartResponse,
  RegisterResult,
  Session,
  TokenPair,
  VerifyEmailResponse,
} from '@/types/auth';

import { ApiError, apiFetch } from './api';
import { clearSession, saveSession } from './session-storage';

/**
 * Client-side authentication helpers.
 *
 * Mirrors the backend auth contract from apps/api/src/auth:
 *   - POST /api/auth/login
 *   - POST /api/auth/register
 *   - POST /api/auth/refresh
 *   - POST /api/auth/logout (requires Authorization: Bearer <accessToken>)
 *
 * Session storage lives in `lib/session-storage.ts` (localStorage,
 * key `socialops.session`); this module only consumes it. It is a leaf
 * module so `lib/api.ts` can import `loadSession` from it without
 * creating an import cycle back into this file.
 */

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: input,
  });
  // The session identity comes from the backend login response, NOT
  // from the login form input. This ensures the displayed Full Name
  // and account type reflect the server's view (AGENTS.md §17).
  if ('accessToken' in response) {
    const session: Session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
      email: response.user.email,
    };
    saveSession(session);
  }
  return response;
}

/**
 * Mandatory email OTP (single-box login): step 2 of 2.
 *
 * POST /api/auth/login/verify-otp — verifies the OTP and issues the
 * token pair. On success, saves the session and returns it.
 */
export interface VerifyLoginOtpRequest {
  email: string;
  otp: string;
}

export async function verifyLoginOtp(
  input: VerifyLoginOtpRequest,
): Promise<Session> {
  const response = await apiFetch<LoginResponse>('/auth/login/verify-otp', {
    method: 'POST',
    body: input,
  });
  if ('accessToken' in response) {
    const session: Session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
      email: response.user.email,
    };
    saveSession(session);
    return session;
  }
  throw new ApiError(400, 'Invalid or expired code', null);
}

/**
 * Mandatory email OTP (single-box login): resend the OTP.
 *
 * POST /api/auth/login/otp/resend — enforces a 60-second cooldown
 * and a maximum of 3 successful resends.
 */
export interface LoginOtpResendResponse {
  sendStatus: 'sent' | 'unavailable';
  resendRemaining: number;
}

export async function resendLoginOtp(
  email: string,
): Promise<LoginOtpResendResponse> {
  return apiFetch<LoginOtpResendResponse>('/auth/login/otp/resend', {
    method: 'POST',
    body: { email },
  });
}

/**
 * Staged registration (Registration Phase v1.0): start or resume a
 * pending registration. NEVER issues tokens or a session - the raw
 * resumeToken returned here is the registration-stage credential only.
 */
export async function startRegistration(
  input: RegistrationStartRequest,
): Promise<RegistrationStartResponse> {
  return apiFetch<RegistrationStartResponse>('/auth/registration/start', {
    method: 'POST',
    body: input,
  });
}

/** Verify one channel's 6-digit registration OTP (dual gate). */
export async function verifyRegistrationOtp(
  input: OtpVerifyRequest,
): Promise<OtpVerifyResponse> {
  return apiFetch<OtpVerifyResponse>('/auth/registration/otp/verify', {
    method: 'POST',
    body: input,
  });
}

/** Resend one channel's registration OTP (max 3 successful resends). */
export async function resendRegistrationOtp(
  input: OtpResendRequest,
): Promise<OtpResendResponse> {
  return apiFetch<OtpResendResponse>('/auth/registration/otp/resend', {
    method: 'POST',
    body: input,
  });
}

/**
 * Create the account after BOTH verifications succeed. Returns the
 * status discriminator only - NEVER a token; continue at /login.
 */
export async function setRegistrationPassword(
  input: RegistrationPasswordRequest,
): Promise<RegistrationCompleteResponse> {
  return apiFetch<RegistrationCompleteResponse>('/auth/registration/password', {
    method: 'POST',
    body: input,
  });
}

/** Restore an in-flight registration from the emailed resume link. */
export async function resumeRegistration(
  input: RegistrationResumeRequest,
): Promise<RegistrationResumeSnapshot> {
  return apiFetch<RegistrationResumeSnapshot>('/auth/registration/resume', {
    method: 'POST',
    body: input,
  });
}

/**
 * Register a new EMPLOYEE account (Employee Module V1).
 *
 * Mirrors register(): the backend creates the User + 1:1 EmployeeProfile
 * atomically, queues an email-verification token (production), or
 * auto-verifies (dev-only bypass). Registration NEVER issues tokens or a
 * session — the response discriminator guides the same post-registration
 * navigation as standard registration (/verify-email or /login).
 *
 * Field contract (mirrors backend RegisterEmployeeDto): fullName, email,
 * phone (optional), password. NO accountType is sent — the EmployeeProfile
 * row is the discriminator (AGENTS.md §17.1).
 */
export async function registerEmployee(
  input: RegisterEmployeeRequest,
): Promise<RegisterResult> {
  return apiFetch<RegisterResult>('/auth/register-employee', {
    method: 'POST',
    body: input,
  });
}

/**
 * Consume a single-use verification token from the verification link.
 *
 * Invalid, expired, and already-used tokens all produce the same
 * generic backend error; the UI must not (and cannot) distinguish
 * them. The raw token is never persisted client-side - it only lives
 * in the verification URL and is sent once to the backend.
 */
export async function verifyEmail(
  token: string,
): Promise<VerifyEmailResponse> {
  return apiFetch<VerifyEmailResponse>('/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}

/**
 * Queue a new verification email. The backend responds with the
 * identical generic body regardless of whether the email exists or is
 * already verified - the UI must not infer account state from it.
 */
export async function resendVerification(
  email: string,
): Promise<GenericStatusResponse> {
  return apiFetch<GenericStatusResponse>('/auth/resend-verification', {
    method: 'POST',
    body: { email },
  });
}

export async function logout(session: Session): Promise<void> {
  // The backend marks the refresh token as revoked. We always clear
  // local storage afterwards, even if the network call fails, so a
  // a stale token cannot be reused from the browser.
  const body: LogoutRequest = { refreshToken: session.refreshToken };
  try {
    await apiFetch<void>('/auth/logout', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // 401 means the access token is already invalid - that's fine, the
    // user's intent is to log out and we still wipe local state.
    if (error.status !== 401) throw error;
  } finally {
    clearSession();
  }
}

export async function refreshAccessToken(session: Session): Promise<TokenPair> {
  const body: RefreshRequest = { refreshToken: session.refreshToken };
  const tokenPair = await apiFetch<TokenPair>('/auth/refresh', {
    method: 'POST',
    body,
  });
  // Refresh only returns tokens; the user identity is preserved
  // unchanged from the existing session.
  const next: Session = {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user: session.user,
    email: session.email,
  };
  saveSession(next);
  return tokenPair;
}

/**
 * SuperAdmin step-up OTP (Decision 020).
 *
 * The step-up flow:
 * 1. POST /admin/step-up/challenge  — issue OTP to user's email
 * 2. POST /admin/step-up/verify     — verify OTP, returns sessionToken
 * 3. Use sessionToken as `X-Admin-Session-Token` header on SUPERADMIN routes
 * 4. POST /admin/step-up/resend     — resend OTP (max 3 times)
 * 5. POST /admin/step-up/logout     — revoke all active step-up sessions
 *
 * The sessionToken is a raw token (not a JWT) that must be stored by
 * the client and sent in the `X-Admin-Session-Token` header on
 * protected admin routes. It is TTL-bound (15 min) and is NOT single-use;
 * it remains valid for multiple requests until expiry, revocation, or
 * explicit consumption.
 */
export async function adminStepUpChallenge(
  input: AdminStepUpChallengeRequest,
): Promise<AdminStepUpChallengeResponse> {
  return apiFetch<AdminStepUpChallengeResponse>('/admin/step-up/challenge', {
    method: 'POST',
    body: input,
  });
}

export async function adminStepUpVerify(
  input: AdminStepUpVerifyRequest,
): Promise<AdminStepUpVerifyResponse> {
  return apiFetch<AdminStepUpVerifyResponse>('/admin/step-up/verify', {
    method: 'POST',
    body: input,
  });
}

export async function adminStepUpLogout(): Promise<void> {
  await apiFetch<void>('/admin/step-up/logout', {
    method: 'POST',
  });
}

export async function adminStepUpResend(
  input: AdminStepUpResendRequest,
): Promise<AdminStepUpResendResponse> {
  return apiFetch<AdminStepUpResendResponse>('/admin/step-up/resend', {
    method: 'POST',
    body: input,
  });
}
