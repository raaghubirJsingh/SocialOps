import type {
  AuthenticatedUser,
  GenericStatusResponse,
  LogoutRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  RegisterResult,
  Session,
  TokenPair,
  VerifyEmailResponse,
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
        accountType:
          parsed.user?.accountType === 'SERVICE_PROVIDER' ||
          parsed.user?.accountType === 'INDIVIDUAL_BUSINESS'
            ? parsed.user.accountType
            : null,
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

/**
 * Login response shape from POST /api/auth/login.
 *
 * The endpoint returns the access/refresh token pair AND the
 * authenticated user identity fields (id, email, fullName,
 * accountType) needed to render the post-login UI. The identity
 * fields are non-secret product data, not authorization state
 * (AGENTS.md §7, §17).
 */
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

export async function login(input: LoginRequest): Promise<Session> {
  const response = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: input,
  });
  // The session identity comes from the backend login response, NOT
  // from the login form input. This ensures the displayed Full Name
  // and account type reflect the server's view (AGENTS.md §17).
  const session: Session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    email: response.user.email,
  };
  saveSession(session);
  return session;
}

/**
 * Register a new account.
 *
 * Registration NEVER issues tokens or an authenticated session
 * (approved contract): the backend creates an UNVERIFIED user and
 * queues a verification email. The caller must navigate the user to
 * /verify-email afterwards. No session is saved here.
 */
export async function register(
  input: RegisterRequest,
): Promise<RegisterResult> {
  return apiFetch<RegisterResult>('/auth/register', {
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
