'use client';

import * as React from 'react';
import { useSession } from './use-session';
import { setActiveOrganizationIdHeader } from '@/lib/api';

/**
 * Active organization context for the Client Foundation.
 *
 * The backend's `OrganizationMembershipGuard` requires the caller to
 * send an `X-Organization-Id` header on every non-public route. The
 * existing `useSession` only stores the authenticated user. This hook
 * adds an in-memory active organization ID that the Client API client
 * (and any future org-scoped UI) can read.
 *
 * The bootstrap intentionally does not persist the active org across
 * reloads (no server-side "GET /me" exists yet). On reload the user
 * is asked to pick an organization again.
 *
 * Selection is provided by the page-level consumer; the hook only
 * exposes `{ activeOrganizationId, setActiveOrganizationId, clear }`.
 */
interface ActiveOrganizationContextValue {
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string | null) => void;
  clear: () => void;
}

const ActiveOrganizationContext = React.createContext<ActiveOrganizationContextValue | null>(null);

export function ActiveOrganizationProvider({ children }: { children: React.ReactNode }) {
  const [activeOrganizationId, setActiveOrganizationIdState] = React.useState<string | null>(null);
  const { isAuthenticated } = useSession();

  // Reset the in-memory selection when the authentication flag actually
  // changes. This uses the React-documented "adjust state during render"
  // pattern (condition on the previous value, not an effect), which keeps
  // the React Compiler's `react-hooks/set-state-in-effect` rule satisfied.
  const [lastAuthenticationState, setLastAuthenticationState] = React.useState(isAuthenticated);
  if (lastAuthenticationState !== isAuthenticated) {
    setLastAuthenticationState(isAuthenticated);
    if (!isAuthenticated) {
      setActiveOrganizationIdState(null);
    }
  }

  const value = React.useMemo<ActiveOrganizationContextValue>(
    () => ({
      activeOrganizationId,
      setActiveOrganizationId: (id) => setActiveOrganizationIdState(id),
      clear: () => setActiveOrganizationIdState(null),
    }),
    [activeOrganizationId],
  );

  // Keep the apiFetch `X-Organization-Id` registry in sync with the
  // in-memory selection. This writes a module-level variable only
  // (no setState), so it stays compliant with the React Compiler's
  // `react-hooks/set-state-in-effect` rule. When authentication is
  // lost, the render-adjust block above resets the state to `null`,
  // which clears the header through this same effect.
  React.useEffect(() => {
    setActiveOrganizationIdHeader(activeOrganizationId);
  }, [activeOrganizationId]);

  return (
    <ActiveOrganizationContext.Provider value={value}>
      {children}
    </ActiveOrganizationContext.Provider>
  );
}

export function useActiveOrganization(): ActiveOrganizationContextValue {
  const ctx = React.useContext(ActiveOrganizationContext);
  if (!ctx) {
    throw new Error('useActiveOrganization must be used inside <ActiveOrganizationProvider>');
  }
  return ctx;
}
