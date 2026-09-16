/**
 * API client for Employee-scoped endpoints.
 *
 * These endpoints are protected by EmployeeContextGuard on the backend,
 * which verifies a 1:1 EmployeeProfile row exists for the authenticated
 * user. The UI should only call these when session.user.isEmployee
 * is true; the backend guard remains authoritative regardless.
 */
import { apiFetch } from './api';

/**
 * Response shape of GET /api/employees/me/profile.
 * Mirrors EmployeesService.getOwnProfile select shape.
 */
export interface EmployeeProfileResponse {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
}

/**
 * Fetch the authenticated employee's own profile.
 *
 * GET /api/employees/me/profile
 *   - Requires a valid JWT (JwtAuthGuard, global)
 *   - Requires the caller to have an EmployeeProfile row
 *     (EmployeeContextGuard -> 403 if absent)
 *
 * The Authorization header is attached automatically by `apiFetch`
 * from the session access token — no secret is handled by the
 * frontend (AGENTS.md §8).
 */
export async function getOwnProfile(): Promise<EmployeeProfileResponse> {
  return apiFetch<EmployeeProfileResponse>('/employees/me/profile');
}