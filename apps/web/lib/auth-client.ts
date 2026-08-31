import type {
  LogoutRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  Session,
  TokenPair,
} from '@/types/auth';

import { ApiError, apiFetch } from './api';

/**
 * Client-side authentication helpers.
 *
 * Mirrors the backend auth contract from apps/api/src/auth:
 *   - POST /api/auth/login
 *   - POST /api/auth/register
 *   - POST /api/auth/refresh
 *   - POST /api/auth/logout (requires Authorization: Bearer <accessToken>)
 *
 * Session storage
 * ---------------
 * Tokens are persisted in `localStorage` under the single key
 * `socialops.session`. AGENTS.md §8 explicitly defers encrypted token
 * storage to a later phase; the bootstrap foundation therefore uses
 * `localStorage` and accepts the standard browser-storage trade-off.
 *
 * The frontend NEVER persists a server-side secret. The access/refresh
 * tokens are user-issued JWTs returned by the backend; they are not
 * server signing keys.
 */

const STORAGE_KEY = 'socialops.session';

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.email === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        email: parsed.email,
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

export async function login(input: LoginRequest): Promise<Session> {
  const tokenPair = await apiFetch<TokenPair>('/auth/login', {
    method: 'POST',
    body: input,
  });
  const session: Session = {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    email: input.email,
  };
  saveSession(session);
  return session;
}

export async function register(input: RegisterRequest): Promise<Session> {
  const tokenPair = await apiFetch<TokenPair>('/auth/register', {
    method: 'POST',
    body: input,
  });
  const session: Session = {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    email: input.email,
  };
  saveSession(session);
  return session;
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
  const next: Session = {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    email: session.email,
  };
  saveSession(next);
  return tokenPair;
}
