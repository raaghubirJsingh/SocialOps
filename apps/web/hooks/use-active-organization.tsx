'use client';

import * as React from 'react';
import { useSession } from './use-session';
import { useMyMemberships } from './use-my-memberships';
import {
  setActiveOrganizationIdHeader,
  setOrganizationResetListener,
} from '@/lib/api';

/**
 * Active organization context for the Client Foundation.
 *
 * The backend's `OrganizationMembershipGuard` requires the caller to
 * send an `X-Organization-Id` header on every non-public route. The
 * existing `useSession` only stores the authenticated user. This hook
 * adds an in-memory active organization ID that the Client API client
 * (and any future org-scoped UI) can read.
 *
 * The active organization is never persisted. After login or reload it is
 * resolved from the authenticated `GET /api/memberships/me` response: when
 * the user has exactly ONE membership (the normal Service Provider case,
 * provisioned by OrganizationProvisioningService with an OWNER membership)
 * that organization is auto-selected with no user action. Zero or two-or-more
 * memberships are never guessed - the user picks from the existing selector
 * (e.g. the Clients page).
 *
 * Selection is provided either by auto-resolution (single membership) or by
 * the page-level consumer; the hook exposes
 * `{ activeOrganizationId, setActiveOrganizationId, clear }`.
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
  const membershipsQuery = useMyMemberships();
  const memberships = membershipsQuery.data?.memberships ?? [];

  // Reset the in-memory selection when the authentication flag actually
  // changes. This uses the React-documented "adjust state during render"
  // pattern (condition on the previous value, not an effect), which keeps
  // the React Compiler's `react-hooks/set-state-in-effect` rule satisfied.
  const [lastAuthenticationState, setLastAuthenticationState] = React.useState(isAuthenticated);
  if (lastAuthenticationState !== isAuthenticated) {
    setLastAuthenticationState(isAuthenticated);
    if (!isAuthenticated) {
      // Logout: clear the apiFetch transport header SYNCHRONOUSLY so no
      // stale organization id can be sent by an in-flight request.
      setActiveOrganizationIdHeader(null);
      setActiveOrganizationIdState(null);
    }
  }

  // Auto-resolve the active organization for a single-membership account
  // (the normal Service Provider case). Same "adjust state during render"
  // pattern as the logout reset above - a guarded setState during render,
  // never an effect - so it stays compliant with the React Compiler's
  // `react-hooks/set-state-in-effect` rule.
  //
  // Zero or >=2 memberships are intentionally left unselected: the user
  // picks from the existing selector (e.g. the Clients page). The id comes
  // ONLY from the authenticated GET /api/memberships/me response; the
  // backend re-verifies it on every scoped call (AGENTS.md §6-§7).
  //
  // Convergence: once activeOrganizationId is set, the `!activeOrganizationId`
  // guard stops the block. After a 403 organizationResetListener reset
  // (state -> null), this can re-select the single org and the scoped call
  // re-runs; if that org is still valid the call now succeeds (200), so
  // there is no infinite render/request loop. A genuinely lost org is
  // filtered out of /memberships/me by the backend, so it will not be the
  // single membership and will not be re-selected.
  const singleOrganizationId =
    memberships.length === 1 ? memberships[0].organization.id : null;
  if (!activeOrganizationId && singleOrganizationId) {
    setActiveOrganizationIdHeader(singleOrganizationId);
    setActiveOrganizationIdState(singleOrganizationId);
  }

  const value = React.useMemo<ActiveOrganizationContextValue>(
    () => ({
      activeOrganizationId,
      // User selection (and any programmatic set): sync the apiFetch
      // transport header synchronously so the very next fetch carries it.
      setActiveOrganizationId: (id) => {
        setActiveOrganizationIdHeader(id);
        setActiveOrganizationIdState(id);
      },
      // Clear: drop the transport header synchronously too.
      clear: () => {
        setActiveOrganizationIdHeader(null);
        setActiveOrganizationIdState(null);
      },
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

  // apiFetch drops the module-level org header when the backend reports
  // the organization context as lost (403 contract, e.g. deactivated
  // organization). Mirror that here so the React state re-renders and the
  // user is returned to organization selection on the next render.
  React.useEffect(() => {
    setOrganizationResetListener(() => setActiveOrganizationIdState(null));
    return () => setOrganizationResetListener(null);
  }, []);

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
