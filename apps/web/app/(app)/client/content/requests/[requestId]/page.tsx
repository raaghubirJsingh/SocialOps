'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import { ClientReviewPortal } from '@/components/content/client-review-portal';
import { RawDataSummary } from '@/components/raw-data/raw-data-summary';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContentRequest } from '@/hooks/use-raw-data';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { loadBoundClientId } from '@/lib/client-session';

export default function ClientContentRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const requestQuery = useContentRequest(clientId, requestId);

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading request…</p>
      </div>
    );
  }

  const backHref = `/client/content?clientId=${clientId}`;

  if (!clientId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          No client context in this session.
        </div>
        <Link href="/client" className="text-sm text-blue-400 hover:underline">
          ← Back to Content Requests
        </Link>
      </div>
    );
  }

  if (requestQuery.isPending) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading request…</p>
      </div>
    );
  }

  if (requestQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(
            requestQuery.error,
            'Unable to load this Content Request.',
          )}
        </div>
        <Link href={backHref} className="text-sm text-blue-400 hover:underline">
          ← Back to Content Requests
        </Link>
      </div>
    );
  }

  const request = requestQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={backHref}
        className="text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        ← Back to Content Requests
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Request</CardTitle>
          <CardDescription>
            Submitted {new Date(request.capturedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RawDataSummary record={request} />
        </CardContent>
      </Card>

      {request.requestedContent ? (
        <ClientReviewPortal
          clientId={clientId}
          contentId={request.requestedContent.id}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft being prepared</CardTitle>
            <CardDescription>
              Your SocialOps team has not added a draft to this request yet.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
