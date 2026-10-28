'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import { ClientReviewPortal } from '@/components/content/client-review-portal';
import { useSession } from '@/hooks/use-session';
import { loadBoundClientId } from '@/lib/client-session';

export default function ClientContentDetailPage() {
  const { contentId } = useParams<{ contentId: string }>();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading } = useSession();

  if (isLoading || !isAuthenticated) {
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
          No client context in this session.
        </p>
        <Link href="/client" className="text-sm text-blue-400 hover:underline">
          ← Back to client dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/client/content?clientId=${clientId}`}
        className="text-sm text-blue-400 hover:underline"
      >
        ← Back to Content Requests
      </Link>
      <ClientReviewPortal clientId={clientId} contentId={contentId} />
    </div>
  );
}
