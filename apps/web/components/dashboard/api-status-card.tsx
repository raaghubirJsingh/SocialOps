'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/hooks/use-session';

/**
 * Readiness contract of GET /api/health (apps/api/src/health).
 * `status` is ok | degraded | unhealthy; database and redis report
 * their individual probe results independently.
 */
export interface HealthCheckResult {
  status: 'ok' | 'error';
  detail?: string;
  error?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  database: HealthCheckResult;
  redis: HealthCheckResult;
}

/**
 * API status card — shared by every dashboard persona.
 *
 * The single highlighted element of the dashboard screen carries the glass
 * surface (APP-SIDE BLUR BUDGET, globals.css). It reads the real public
 * /api/health endpoint via TanStack Query; no analytics are fabricated —
 * this is the one real network call the foundation makes, so the full
 * network stack can be verified end-to-end.
 *
 * The query keeps the conservative global policy (no auto-retry, no
 * refetch-on-focus, see lib/query-client.ts). Because a network failure
 * would otherwise stay on screen forever, the error state carries an
 * explicit manual Retry control.
 */
export function ApiStatusCard() {
  const { isAuthenticated } = useSession();

  const health = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    enabled: isAuthenticated,
    retry: 0,
  });

  const statusClass =
    health.data?.status === 'ok'
      ? 'text-emerald-300'
      : health.data?.status === 'degraded'
        ? 'text-amber-300'
        : 'text-red-400';

  return (
    <Card surface="glass">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-200">
          API status
        </CardTitle>
        <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {health.isPending ? (
          <p className="text-sm text-slate-400">Checking…</p>
        ) : health.isError ? (
          <>
            <p className="text-sm text-red-400">
              Unable to reach the API.{' '}
              <span className="text-xs text-slate-400">
                ({(health.error as Error)?.message ?? 'unknown error'})
              </span>
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => void health.refetch()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </>
        ) : health.data ? (
          <>
            <p
              className={`text-2xl font-semibold tabular-nums ${statusClass}`}
            >
              {health.data.status.toUpperCase()}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Database: {health.data.database.status} · Redis:{' '}
              {health.data.redis.status}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}