'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Users } from 'lucide-react';

import { ApiStatusCard } from '@/components/dashboard/api-status-card';
import {
  ClientActivationPanel,
  ClientPersonaSurface,
} from '@/components/dashboard/client/client-activation-panel';
import { EmployeeProfileCard } from '@/components/dashboard/employee-profile-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSession } from '@/hooks/use-session';
import { loadBoundClientId } from '@/lib/client-session';
import type { AccountType } from '@/types/auth';

/**
 * Maps the account-type enum to the user-facing label shown in the
 * dashboard and (in the future) the user menu.
 *
 * AGENTS.md §17.1 (as amended by Decision 014): the two public
 * account-type values are
 *   - SERVICE_PROVIDER
 *   - CLIENT
 * The CLIENT label is the user-facing wording "Business / Personal
 * Account" (OPEN-11) - the technical enum name is never the primary
 * user-facing label. The label is presentational; the underlying value
 * is unchanged.
 */
function labelForAccountType(t: AccountType | null | undefined): string {
  if (t === 'SERVICE_PROVIDER') return 'Service Provider';
  if (t === 'CLIENT') return 'Business / Personal Account';
  return '';
}

/**
 * Dashboard route (/dashboard).
 *
 * Moved from (app)/page.tsx so that "/" is owned exclusively by the
 * public Home page (approved routing matrix). The (app) route group
 * provides the application shell and the AuthGuard; this page renders
 * the persona-aware foundation dashboard.
 *
 * The dashboard greets the authenticated user by their registered
 * Full Name (AGENTS.md §17) and identifies their account type. The
 * greeting and account-type label are both sourced from the Session
 * (which carries the identity returned by `POST /api/auth/login`),
 * never from the login-form input.
 *
 * Three personas, all honest-data only (AGENTS.md §13 — the foundation
 * does not invent business data):
 *   - Employee (isEmployee): read-only profile card + system status;
 *     no Service Provider (Agency) tenant panels (AGENTS.md §17.4).
 *   - Individual / Business (self-registered client): direct links
 *     into the approved /client/* self-service area. The agency
 *     "Workspaces and organizations" placeholder is meaningless for a
 *     client account (no Organization membership) and is omitted.
 *   - Service Provider (agency): the foundation dashboard with the
 *     workspaces placeholder and a quick link to /clients.
 *
 * The only real network call the foundation makes is the public
 * /api/health endpoint, rendered by the shared ApiStatusCard.
 */
export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: sessionLoading, session } = useSession();

  // Resolve employee flag from the session (AGENTS.md §6 / §17.3).
  // This drives UI-level dashboard isolation; the backend
  // EmployeeContextGuard remains authoritative for the API call.
  const isEmployee = session?.user?.isEmployee === true;

  // Client persona (CLIENT - "Business / Personal Account"): the
  // self-registered client account. `accountType` is product metadata,
  // NOT authorization state (§7); the backend enforces the real
  // boundary on every /client/me/* call.
  const isClientAccount =
    !isEmployee && session?.user?.accountType === 'CLIENT';

  // Defense-in-depth page guard. The (app) layout AuthGuard already
  // redirects unauthenticated visitors to the public home page "/"
  // (approved routing matrix — NOT /login); this page-level effect
  // mirrors that target in case the layout guard is ever bypassed.
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, sessionLoading, router]);

  // Activation flipped the server state: drop every cached query and let
  // the router re-render — the unlocked services appear immediately and
  // the status reads Active (server-owned, never client-faked).
  const handleActivated = () => {
    void queryClient.invalidateQueries();
    router.refresh();
  };

  if (!isAuthenticated) {
    // Render nothing while the guard redirects; avoids a flash of
    // authenticated UI. (Every localStorage read below is therefore
    // strictly post-mount, so SSR and the first client render agree.)
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // Employee Dashboard
  // ─────────────────────────────────────────────────────────
  // When the session identifies the user as an employee, render a
  // strictly read-only employee dashboard. This branch never
  // fetches Service Provider (Agency) tenant data — the Activity
  // and Workspaces/Organizations cards from the standard dashboard
  // are omitted entirely (AGENTS.md §6, §13).
  if (isEmployee) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">
            Welcome, {session?.user.fullName ?? 'there'}
          </h2>
          <p className="text-sm text-slate-400">
            Signed in as an{' '}
            <span className="font-medium text-slate-200">Employee</span>
          </p>
        </header>

        <ApiStatusCard />

        <EmployeeProfileCard />

        {/*
         * Intentionally empty: the Activity, Workspaces, and
         * Organization panels from the Service Provider dashboard
         * are not applicable to employees (AGENTS.md §13).
         */}
      </div>
    );
  }

  // Identity display (AGENTS.md §17):
  //   - The primary greeting uses the registered Full Name, not the
  //     email. This is the persona the user set up at registration.
  //   - If Full Name is missing (pre-migration row, or a stale
  //     session loaded from localStorage with no identity), we fall
  //     back to a generic greeting. The dashboard never breaks.
  //   - The email is shown as secondary information.
  const fullName = session?.user.fullName;
  const accountType = session?.user.accountType;
  const accountTypeLabel = labelForAccountType(accountType);
  const greetingTarget = fullName ?? 'there';

  // ─────────────────────────────────────────────────────────
  // Client Dashboard (self-registered Individual / Business)
  // ─────────────────────────────────────────────────────────
  // The client persona owns exactly one Client row, bound server-side.
  // Its approved self-service area lives under /client/*; the agency
  // "Clients" surface is meaningless here (a self-registered client has
  // no Organization membership and would only hit the organization
  // dead end). The overview itself is rendered by ClientOverview; the
  // persisted binding id it uses is a lookup hint only — ClientAccessGuard
  // re-verifies the binding on every request.
  if (isClientAccount) {
    const boundClientId = loadBoundClientId();

    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Welcome, {greetingTarget}
          </h2>
          <p className="text-sm text-slate-400">
            {accountTypeLabel ? (
              <>
                Signed in as a{' '}
                <span className="font-medium text-slate-200">
                  {accountTypeLabel}
                </span>
                {session?.user.email ? <> · {session.user.email}</> : null}
              </>
            ) : session?.user.email ? (
              <>Signed in as {session.user.email}</>
            ) : (
              <>Signed in to SocialOps</>
            )}
          </p>
        </header>

        {boundClientId ? (
          <ClientPersonaSurface
            clientId={boundClientId}
            onActivated={handleActivated}
          />
        ) : (
          <ClientActivationPanel onActivated={handleActivated} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Welcome, {greetingTarget}
        </h2>
        <p className="text-sm text-slate-400">
          {accountTypeLabel ? (
            <>
              Signed in as a{' '}
              <span className="font-medium text-slate-200">
                {accountTypeLabel}
              </span>
              {session?.user.email ? (
                <> · {session.user.email}</>
              ) : null}
            </>
          ) : session?.user.email ? (
            <>Signed in as {session.user.email}</>
          ) : (
            <>Signed in to SocialOps</>
          )}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* The single highlighted element on this screen carries the glass
            surface (APP-SIDE BLUR BUDGET, globals.css); the Activity and
            Workspaces panels stay on surface-panel. */}
        <ApiStatusCard />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-200">
              Activity
            </CardTitle>
            <Activity
              className="h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              No activity yet.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Activity feeds appear here once the corresponding
              modules are implemented and approved.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces and organizations</CardTitle>
          <CardDescription>
            Workspace and organization management is not part of
            the foundation. Once it is implemented and explicitly
            approved, this area will display the organizations you
            belong to and the workspaces inside them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">
            Not yet implemented.
          </p>
          <Link
            href="/clients"
            className="inline-flex items-center gap-2 rounded text-sm text-blue-400 transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Manage clients
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
