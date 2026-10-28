'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { RawDataList } from '@/components/raw-data/raw-data-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContentRequests } from '@/hooks/use-raw-data';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { loadBoundClientId } from '@/lib/client-session';

export default function ClientContentPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const requestsQuery = useContentRequests(clientId);

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

  const requests = requestsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            My Content Requests
          </h2>
          <p className="text-sm text-slate-400">
            Review your submitted requests and any draft prepared by SocialOps.
          </p>
        </div>
        <Button asChild>
          <Link href={`/client/content/request?clientId=${clientId}`}>
            Submit Content Request
          </Link>
        </Button>
      </header>

      {requestsQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(
            requestsQuery.error,
            'Unable to load your content requests.',
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests shown</CardTitle>
            <CardDescription>
              {requests.length}{' '}
              {requests.length === 1 ? 'request loaded' : 'requests loaded'} on
              this page
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requestsQuery.isPending ? (
              <p className="text-sm text-slate-400">
                Loading your requests…
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
      {!requestsQuery.isError && !requestsQuery.isPending ? (
        <RawDataList
          records={requests}
          variant="client"
          title="My Content Requests"
          description="Your request brief, platforms, submission date, and draft availability."
          detailHref={(requestId) =>
            `/client/content/requests/${requestId}?clientId=${clientId}`
          }
        />
      ) : null}
    </div>
  );
}
