'use client';

import * as React from 'react';

import { ApiError } from '@/lib/api';
import {
  login as loginRequest,
  logout as logoutRequest,
  refreshAccessToken,
} from '@/lib/auth-client';
import {
  setSessionSyncListener,
  setTokenRefreshInvoker,
} from '@/lib/api';
import { clearSession, loadSession } from '@/lib/session-storage';
import type { LoginRequest, Session } from '@/types/auth';

/**
 * Session context for the authenticated user.
 *
 * The session holds the access + refresh tokens returned by the
 * backend `/api/auth/login` endpoint. Tokens live in `localStorage`
 * for the duration of the bootstrap (AGENTS.md §8 defers encrypted
 * token storage to a later phase).
 *
 * The hook exposes:
 *   - `session` - the current `Session` or `null`
 *   - `login(input)` - call backend, persist session, navigate
 *   - `logout()` - call backend logout, clear local state, navigate
 *   - `isLoading` - true while a mutation is in flight
 *   - `error` - the most recent `ApiError`, or `null`
 *
 * Server-side authorization is still authoritative (AGENTS.md §7);
 * this hook is a UI convenience, never a security boundary.
 */

interface SessionContextValue {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: ApiError | null;
  login: (input: LoginRequest) => Promise<Session>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Initialize the session synchronously from localStorage. This is a
  // client-side render, so the storage is available immediately.
  // The React Compiler's `react-hooks/set-state-in-effect` rule
  // forbids the `useEffect(() => setState(loadSession()), [])`
  // pattern; the lazy initializer is the recommended replacement.
  const [session, setSession] = React.useState<Session | null>(() =>
    loadSession(),
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  const login = React.useCallback(
    async (input: LoginRequest): Promise<Session> => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await loginRequest(input);
        setSession(next);
        return next;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'Network error. Please try again.', null);
        setError(apiError);
        throw apiError;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = React.useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      if (session) {
        await logoutRequest(session);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
      // We always clear local state even on failure - the user's
      // intent is to log out, not to retry the server round-trip.
    } finally {
      clearSession();
      setSession(null);
      setIsLoading(false);
    }
  }, [session]);

  const clearError = React.useCallback(() => setError(null), []);

  // Wire the apiFetch recovery paths to this provider (the owner of the
  // session lifecycle). Registered once on mount. The invoker re-reads the
  // session from localStorage AT CALL TIME so it always presents the latest
  // rotated refresh token, even after background refreshes.
  React.useEffect(() => {
    setSessionSyncListener(() => setSession(loadSession()));
    setTokenRefreshInvoker(async () => {
      const current = loadSession();
      if (!current) return false;
      try {
        await refreshAccessToken(current);
        return true;
      } catch {
        // Refresh failed: the refresh token is invalid, expired, or was
        // replayed (backend reuse protection). Wipe the session; the sync
        // listener (invoked by apiFetch right after) will flip
        // isAuthenticated to false and the AuthGuard will redirect.
        clearSession();
        return false;
      }
    });
    return () => {
      setSessionSyncListener(null);
      setTokenRefreshInvoker(null);
    };
  }, []);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      isLoading,
      error,
      login,
      logout,
      clearError,
    }),
    [session, isLoading, error, login, logout, clearError],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside a <SessionProvider>');
  }
  return ctx;
}
