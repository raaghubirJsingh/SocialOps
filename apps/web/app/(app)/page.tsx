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
import { apiFetch } from '@/lib/api';
import { useSession } from '@/hooks/use-session';

interface HealthResponse {
  status: 'ok';
  service: 'socialops-api';
}

/**
 * Dashboard entry route. The (app) route group provides the
 * application shell, this page renders the foundation dashboard.
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
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  // Client-side session guard. Server components cannot read
  // localStorage, so the route is rendered and then the guard
  // navigates away if the user is not signed in.
  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace('/login');
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-100">
          Welcome to SocialOps
        </h2>
        <p className="text-sm text-slate-400">
          The frontend foundation is in place. This page shows
          real backend connectivity; everything else is left
          empty until later modules are explicitly approved.
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
                  Service: {health.data.service}
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
