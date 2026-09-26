/**
 * Authentication-related shared types.
 *
 * Mirrors the backend DTOs at apps/api/src/auth.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Account classification (AGENTS.md §17.1 as amended by Registration
 * Phase v1.0 / Decision 014). Exactly two values; Individual vs
 * Business is a ClientType, never an AccountType. Employee is
 * intentionally NOT here: employees carry `accountType = null` and are
 * discriminated by the 1:1 EmployeeProfile row.
 */
export type AccountType = 'SERVICE_PROVIDER' | 'CLIENT';

/**
 * Authenticated user identity returned by `POST /api/auth/login` and
 * stored on the frontend `Session`.
 *
 * This is product/identity data, not authorization state (AGENTS.md
 * §7, §17). The frontend MAY use `accountType` to make
 * post-login UI visibility decisions but the backend remains the
 * security boundary.
 * Authorization is still determined server-side by
 * `OrganizationMembership.role`.
 *
 * `fullName` and `accountType` are nullable for backward
 * compatibility with pre-migration user rows (see
 * `20260903220000_add_user_registration_fields`); the frontend falls
 * back to email or a generic label when these are missing.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
    fullName: string | null;
  accountType: AccountType | null;
  /**
   * Employee Module V1: true when a 1:1 EmployeeProfile row exists for
   * this user (derived at login time from the EmployeeProfile relation).
   * UI routing convenience only — not authorization state. The
   * server-side authority is EmployeeContextGuard, verified per request.
   */
  isEmployee: boolean;
}

/**
 * Staged registration (Registration Phase v1.0) request/response types.
 *
 * Mirrors the backend DTOs at apps/api/src/registration. The resumeToken
 * is the ONLY registration-stage credential (OPEN-1): not a JWT, not a
 * session; raw value returned once per /start and carried in the emailed
 * resume link; only its SHA-256 is stored server-side.
 */
export type DiscoveryAnswers = Record<string, unknown>;

export interface RegistrationStartRequest {
  fullName: string;
  email: string;
  /** Raw user input; the server normalizes to canonical form (OPEN-2). */
  phone: string;
  /** Nullable while discovery is unresolved (L13); required by /password. */
  accountType?: AccountType | null;
  discoveryAnswers?: DiscoveryAnswers;
  /** Present only when resuming/editing an existing pending row (L6). */
  resumeToken?: string;
}

export interface RegistrationStartResponse {
  status: 'pending_created' | 'pending_resumed';
  resumeToken: string;
  expiresAt: string;
  maskedEmail: string;
  maskedPhone: string;
  accountType: AccountType | null;
  emailVerified: boolean;
  whatsappVerified: boolean;
  sendStatus: { email: 'sent' | 'unavailable'; whatsapp: 'sent' | 'unavailable' };
  resendRemaining: { email: number; whatsapp: number };
  lockedUntil: string | null;
}

export type OtpChannel = 'EMAIL' | 'WHATSAPP';

export interface OtpVerifyRequest {
  resumeToken: string;
  channel: OtpChannel;
  /** 6-digit STRING so a leading zero survives (L4). */
  otp: string;
}

export interface OtpVerifyResponse {
  channel: OtpChannel;
  verified: boolean;
  bothVerified: boolean;
}

export interface OtpResendRequest {
  resumeToken: string;
  channel: OtpChannel;
}

export interface OtpResendResponse {
  channel: OtpChannel;
  sendStatus: 'sent' | 'unavailable' | 'already_verified';
  resendRemaining: number;
}

export interface RegistrationPasswordRequest {
  resumeToken: string;
  password: string;
  /**
   * Resume-path completion (L13): when the pending registration started
   * with an unresolved classification, the explicit forced-choice
   * selection travels with the password stage. Never guessed.
   */
  accountType?: AccountType | null;
}

export interface RegistrationCompleteResponse {
  status: 'registration_complete';
}

export interface RegistrationResumeRequest {
  resumeToken: string;
}

export interface RegistrationResumeSnapshot {
  stage: 'verification' | 'password';
  expiresAt: string;
  accountType: AccountType | null;
  fullName: string;
  maskedEmail: string;
  maskedPhone: string;
  emailVerified: boolean;
  whatsappVerified: boolean;
  resendRemaining: { email: number; whatsapp: number };
  lockedUntil: string | null;
}

/**
 * Employee registration request body.
 *
 * Mirrors the backend RegisterEmployeeDto (apps/api/src/auth/dto/
 * register-employee.dto.ts): fullName, email, phone (optional),
 * password. NO accountType — employee is discriminated by the 1:1
 * EmployeeProfile row, not AccountType (AGENTS.md §17.1).
 */
export interface RegisterEmployeeRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

/**
 * The local session stored in `localStorage` and used by the auth
 * provider. The `user` object is the canonical source of identity for
 * the authenticated UI (greeting by Full Name, account-type label,
 * sidebar filter). The top-level `email` is kept as a convenience for
 * the topbar trigger and is always equal to `user.email`.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
  /**
   * Convenience mirror of `user.email` retained for backward
   * compatibility with code that reads `session.email` directly.
   */
  email: string;
}

/**
 * Result of the employee registration endpoint (the legacy public
 * register flow is fully retired - L11).
 *
 * The response is a discriminated union on `status`:
 *
 *   - `registration_complete` - dev-only. The new user is already
 *     ACTIVE and verified. The client should navigate to /login so
 *     the user can sign in normally. This branch is only ever
 *     produced when the dev-only `AUTH_DEV_AUTO_VERIFY_REGISTER`
 *     bypass gate is open (NON-production only).
 *
 *   - `verification_required` - production. The new user is INACTIVE
 *     and an EmailVerificationToken has been created. The client
 *     should navigate to /verify-email.
 *
 * Registration NEVER issues a JWT, access token, refresh token, or
 * session. The session is always created by `POST /api/auth/login`.
 * The staged conversational registration returns
 * RegistrationCompleteResponse instead (same no-token invariant).
 */
export type RegisterResultStatus =
  | 'registration_complete'
  | 'verification_required';

export interface RegisterResultRegistrationComplete {
  status: 'registration_complete';
  email: string;
}

export interface RegisterResultVerificationRequired {
  status: 'verification_required';
  email: string;
}

export type RegisterResult =
  | RegisterResultRegistrationComplete
  | RegisterResultVerificationRequired;

/** Result of POST /api/auth/verify-email. */
export interface VerifyEmailResponse {
  status: 'verified';
}

/**
 * Generic status response shared by verification endpoints. The backend
 * deliberately returns identical shapes regardless of account state so
 * no account information can be inferred (no email enumeration).
 */
export interface GenericStatusResponse {
  status: 'verified' | 'queued';
}
