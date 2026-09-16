'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ContentForm } from '@/components/content/content-form';
import { ContentList } from '@/components/content/content-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContentList, useCreateContent } from '@/hooks/use-content';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { cn } from '@/lib/cn';
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from '@/types/content';

/**
 * Client self-service: my Content.
 *
 * The owner may create and edit drafts, review items (request changes), and
 * approve through the dedicated Final Confirmation flow on the detail page.
 * Every request carries `X-Client-Id`, re-verified server-side against the
 * User -> Client binding.
 */
export default function ClientContentPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const listQuery = useContentList('mine', clientId, statusFilter);
  const createMutation = useCreateContent('mine', clientId);

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
          No client context in this session. Open your client dashboard and start
          from there.
        </p>
        <Link href="/client" className="text-sm text-blue-400 hover:underline">
          ← Back to client dashboard
        </Link>
      </div>
    );
  }

  const handleCreate = async (values: { title: string; body: string }) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values);
      setShowCreate(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to create the draft. Please try again.'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">Content</h2>
          <p className="text-sm text-slate-400">
            Review what your agency prepared and grant final confirmation for the
            text you approve. Publishing is not part of this phase.
          </p>
        </div>
        {!showCreate && (
          <Button type="button" onClick={() => setShowCreate(true)}>
            New draft
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(['ALL', ...CONTENT_STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              statusFilter === value
                ? 'border-blue-800 bg-blue-950/50 text-blue-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200',
            )}
          >
            {value === 'ALL'
              ? 'All'
              : CONTENT_STATUS_LABELS[value as ContentStatus]}
          </button>
        ))}
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New draft</CardTitle>
            <CardDescription>
              Items always start as Draft. You can submit them for review when ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContentForm
              mode="create"
              onSubmit={handleCreate}
              onCancel={() => {
                setShowCreate(false);
                setServerError(null);
              }}
              isSubmitting={createMutation.isPending}
              error={serverError}
            />
          </CardContent>
        </Card>
      )}

      {listQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(listQuery.error, 'Unable to load your content.')}
        </div>
      ) : listQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading content…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentList
          items={listQuery.data}
          detailHref={(contentId) => `/client/content/${contentId}?clientId=${clientId}`}
          emptyDescription="Nothing has been drafted yet. Create a draft or wait for your agency to prepare one."
        />
      )}
    </div>
  );
}