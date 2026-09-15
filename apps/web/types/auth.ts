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
 * Public registration account-type selection (AGENTS.md §17.1).
 *
 * The public `/register` page offers exactly these two values and no
 * other. Employee is intentionally NOT here: Employee registration is
 * a separate future flow.
 */
export type AccountType = 'SERVICE_PROVIDER' | 'INDIVIDUAL_BUSINESS';

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
 * Public registration request body (AGENTS.md §17.2).
 *
 * Field contract:
 *   - accountType  required; exactly one of the two values
 *   - fullName     required
 *   - email        required
 *   - phone        optional
 *   - password     required
 *
 * Frontend NEVER sends: confirmPassword (UI-only), displayName
 * (populated server-side from fullName), isActive, emailVerifiedAt,
 * role, organizationId, or any other backend-controlled field.
 */
export interface RegisterRequest {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
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
 * Result of POST /api/auth/register (AGENTS.md §17.2).
 *
 * The response is a discriminated union on `status`:
 *
 *   - `registration_complete` — dev-only. The new user is already
 *     ACTIVE and verified. The client should navigate to /login so
 *     the user can sign in normally. This branch is only ever
 *     produced when the dev-only `AUTH_DEV_AUTO_VERIFY_REGISTER`
 *     bypass gate is open (NON-production only).
 *
 *   - `verification_required` — production. The new user is INACTIVE
 *     and an EmailVerificationToken has been created. The client
 *     should navigate to /verify-email.
 *
 * Registration NEVER issues a JWT, access token, refresh token, or
 * session. The session is always created by `POST /api/auth/login`.
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
