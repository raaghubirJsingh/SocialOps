'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldCheck } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmployeeProfileCard } from '@/components/dashboard/employee-profile-card';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import type { AccountType } from '@/types/auth';

/**
 * Readiness contract of GET /api/health (apps/api/src/health).
 * `status` is ok | degraded | unhealthy; database and redis report
 * their individual probe results independently.
 */
interface HealthCheckResult {
  status: 'ok' | 'error';
  detail?: string;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  database: HealthCheckResult;
  redis: HealthCheckResult;
}

/**
 * Maps the public-registration account-type enum to the user-facing
 * label shown in the dashboard and (in the future) the user menu.
 *
 * AGENTS.md §17.1: the two public account-type values are
 *   - SERVICE_PROVIDER
 *   - INDIVIDUAL_BUSINESS
 * The label is presentational; the underlying value is unchanged.
 */
function labelForAccountType(t: AccountType | null | undefined): string {
  if (t === 'SERVICE_PROVIDER') return 'Service Provider';
  if (t === 'INDIVIDUAL_BUSINESS') return 'Individual / Business';
  return '';
}

/**
 * Dashboard route (/dashboard).
 *
 * Moved from (app)/page.tsx so that "/" is owned exclusively by the
 * public Home page (approved routing matrix). The (app) route group
 * provides the application shell and the AuthGuard; this page renders
 * the foundation dashboard.
 *
 * The dashboard greets the authenticated user by their registered
 * Full Name (AGENTS.md §17) and identifies their account type. The
 * greeting and account-type label are both sourced from the Session
 * (which carries the identity returned by `POST /api/auth/login`),
 * never from the login-form input.
 *
 * The dashboard calls the real public `/api/health` endpoint via
 * TanStack Query - this is the only real network call the foundation
 * makes. No analytics are fabricated; instead, a single "system
 * status" card shows the API health response so we can verify the
 * full network stack end-to-end.
 *
 * Memberships / workspaces panels are explicitly empty-state and
 * clearly labelled as "not yet implemented" - the foundation does
 * not invent business data.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: sessionLoading, session } = useSession();

  // Resolve employee flag from the session (AGENTS.md §6 / §17.3).
  // This drives UI-level dashboard isolation; the backend
  // EmployeeContextGuard remains authoritative for the API call.
  const isEmployee = session?.user?.isEmployee === true;

  // Defense-in-depth page guard. The (app) layout AuthGuard already
  // redirects unauthenticated visitors to the public home page "/"
  // (approved routing matrix — NOT /login); this page-level effect
  // mirrors that target in case the layout guard is ever bypassed.
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, sessionLoading, router]);

  const health = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    enabled: isAuthenticated,
    retry: 0,
  });

  if (!isAuthenticated) {
    // Render nothing while the guard redirects; avoids a flash of
    // authenticated UI.
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-100">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-200">
              API status
            </CardTitle>
            <ShieldCheck
              className="h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent>
            {health.isPending ? (
              <p className="text-sm text-slate-400">Checking…</p>
            ) : health.isError ? (
              <p className="text-sm text-red-400">
                Unable to reach the API.{' '}
                <span className="text-xs text-slate-500">
                  ({(health.error as Error)?.message ?? 'unknown error'})
                </span>
              </p>
            ) : health.data ? (
              <>
                <p className="text-2xl font-semibold text-slate-100">
                  {health.data.status.toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Database: {health.data.database.status} · Redis:{' '}
                  {health.data.redis.status}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

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
            <p className="mt-1 text-xs text-slate-500">
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
        <CardContent>
          <p className="text-sm text-slate-400">
            Not yet implemented.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
