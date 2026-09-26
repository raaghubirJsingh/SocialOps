/**
 * Session persistence helpers (localStorage).
 *
 * Tokens are persisted under the single key `socialops.session`.
 * AGENTS.md §8 explicitly defers encrypted token storage to a later
 * phase; the bootstrap foundation therefore uses `localStorage` and
 * accepts the standard browser-storage trade-off.
 *
 * This module intentionally imports NOTHING from the rest of the app
 * (only a type-only import from `@/types/auth`, which is erased at
 * compile time). Both `lib/api.ts` and `lib/auth-client.ts` import
 * from here so neither becomes the other's dependency (no cycle).
 *
 * The frontend NEVER persists a server-side secret. The access/refresh
 * tokens are user-issued JWTs returned by the backend; they are not
 * server signing keys.
 */

import type { AuthenticatedUser, Session } from '@/types/auth';

const STORAGE_KEY = 'socialops.session';

/**
 * Accepts the current AccountType values and NORMALIZES the legacy
 * 'INDIVIDUAL_BUSINESS' value (renamed to 'CLIENT' by Registration
 * Phase v1.0 / Decision 014) so sessions persisted before the rename
 * keep the correct CLIENT persona until the next login refreshes the
 * stored identity. Unknown values degrade to null (graceful fallback,
 * same precedent as the pre-existing backward-compat handling below).
 */
function normalizeAccountType(
  value: unknown,
): AuthenticatedUser['accountType'] {
  if (value === 'SERVICE_PROVIDER' || value === 'CLIENT') return value;
  if (value === 'INDIVIDUAL_BUSINESS') return 'CLIENT';
  return null;
}

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> & {
      user?: Partial<AuthenticatedUser>;
    };
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string'
    ) {
      // Backward compatibility with sessions written by previous
      // versions of this client (which stored only the email at the
      // top level and had no `user` object). If a stale session is
      // loaded, reconstruct a minimal `user` from whatever fields are
      // available. The dashboard and sidebar use `??` fallbacks for
      // null `fullName` / `accountType`, so the UI degrades gracefully
      // and the user is prompted to log in again to refresh.
      const email =
        typeof parsed.email === 'string'
          ? parsed.email
          : typeof parsed.user?.email === 'string'
          ? parsed.user.email
          : '';
      const user: AuthenticatedUser = {
        id: typeof parsed.user?.id === 'string' ? parsed.user.id : '',
        email,
        fullName:
          typeof parsed.user?.fullName === 'string' ? parsed.user.fullName : null,
        accountType: normalizeAccountType(parsed.user?.accountType),
        // Backward compat: older sessions predate isEmployee. Default
        // to false so the UI degrades to standard (non-employee) routing.
        isEmployee: parsed.user?.isEmployee === true,
      };
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        user,
        email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}