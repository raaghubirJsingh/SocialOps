'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bell } from 'lucide-react';

import { ClientActivityList } from '@/components/dashboard/client/client-activity-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useMyHistory } from '@/hooks/use-client-overview';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { loadBoundClientId } from '@/lib/client-session';

/**
 * Client notifications — the client's OWN audit trail
 * (GET /api/client/me/history), rendered as a plain, honest event list.
 *
 * There is no notifications module in V1 (deferred): nothing here is
 * fabricated, no badge counts are invented, and unknown future actions
 * render through the neutral prettifier (lib/client-event-labels.ts).
 * The `?clientId=` hint falls back to the persisted, server-verified
 * binding; the backend re-verifies the binding on every call.
 */
export default function ClientNotificationsPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const historyQuery = useMyHistory(clientId);

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          No client context in this session. Open your client dashboard and
          start from there.
        </p>
        <Link
          href="/client"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to client dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-100">
          <Bell className="h-5 w-5 text-blue-400" aria-hidden="true" />
          Notifications
        </h2>
        <p className="text-sm text-slate-400">
          Everything recorded against your client profile — sourced from your
          real audit trail. No fabricated alerts.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All events</CardTitle>
          <CardDescription>Newest first · server-recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading notifications…</p>
          ) : historyQuery.error ? (
            <p role="alert" className="text-sm text-red-300">
              {describeApiError(historyQuery.error, 'Unable to load your notifications.')}
            </p>
          ) : (
            <ClientActivityList
              events={historyQuery.data ?? []}
              emptyLabel="Nothing recorded yet."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}