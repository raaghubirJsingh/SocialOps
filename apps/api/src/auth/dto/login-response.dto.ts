import type { AccountType } from './account-type.js';

/**
 * Canonical response returned by POST /api/auth/login.
 *
 * The login endpoint is the moment an authenticated session begins.
 * In addition to the JWT pair, the response carries the minimum user
 * identity the frontend needs to render the post-login UI (greeting
 * by Full Name, account-type label, and the sidebar's
 * accountType-based visibility filter) without an extra round-trip
 * to a `/me` endpoint.
 *
 * Security properties:
 *   - The response NEVER includes `passwordHash`, `isActive`, or any
 *     other server-managed field. Only the four identity fields the
 *     UI needs to display a greeting and render navigation.
 *   - `accountType` is product metadata describing how the user
 *     intends to use SocialOps. It is NOT a role and NOT an
 *     authorization state (AGENTS.md §7, §17). Roles live on
 *     `OrganizationMembership` and are server-enforced on every API
 *     call. The frontend MAY use `accountType` for post-login UI
 *     visibility but the backend remains the security boundary.
 *   - `fullName` may be null for pre-migration user rows that were
 *     created before the field was added (see
 *     `20260903220000_add_user_registration_fields`). The frontend
 *     falls back to email or a generic label in that case.
 *   - `accountType` may be null for the same reason. The frontend
 *     treats null as "unknown / pre-migration" and does not hide any
 *     navigation as a result (the safe default).
 */
export interface LoginUserDto {
  id: string;
  email: string;
  fullName: string | null;
  accountType: AccountType | null;
  /**
   * Employee Module V1: true when a 1:1 EmployeeProfile row exists for
   * this user. Derived at read time from the EmployeeProfile relation
   * (never stored in AccountType, which intentionally has no EMPLOYEE
   * value — AGENTS.md §17.1).
   *
   * UI routing convenience ONLY — not authorization state. The server-side
   * authority is EmployeeContextGuard, which re-verifies the profile
   * against PostgreSQL on every employees/* request.
   */
  isEmployee: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: LoginUserDto;
}
