/**
 * Canonical response returned by POST /api/auth/register.
 *
 * The response is a discriminated union on `status`:
 *
 *   - `registration_complete` — dev-only. The new user is already
 *     ACTIVE and `emailVerifiedAt` is populated. The frontend should
 *     navigate to `/login` so the user can sign in normally. The
 *     server still issues NO tokens at registration time; the session
 *     is created by `/api/auth/login`. This branch is only ever
 *     produced when the dev-only `AUTH_DEV_AUTO_VERIFY_REGISTER` gate
 *     is open (see `dev-auto-verify.ts`).
 *
 *   - `verification_required` — production. The new user is INACTIVE
 *     with `emailVerifiedAt = null`; an `EmailVerificationToken` row
 *     has been created. The frontend should navigate to `/verify-email`
 *     to complete the verification flow.
 *
 * No JWT, access token, refresh token, or session is ever returned
 * from this endpoint (AGENTS.md §8, §17.2). The session is always
 * created by `POST /api/auth/login`.
 *
 * The frontend uses the `status` discriminator to decide which page to
 * navigate to.
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
