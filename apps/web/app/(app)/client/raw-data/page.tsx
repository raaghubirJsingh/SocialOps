'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { RawDataIntakeForm } from '@/components/raw-data/raw-data-intake-form';
import { RawDataList } from '@/components/raw-data/raw-data-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContentList } from '@/hooks/use-content';
import { useCreateRawData, useRawData } from '@/hooks/use-raw-data';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { loadBoundClientId } from '@/lib/client-session';
import type { CreateRawDataRequest } from '@/types/content';

/**
 * Client self-service: my Content Requests (INSERT-ONLY, paste-only).
 *
 * `clientId` is a lookup hint from the query string; the backend re-verifies
 * the ownership binding on every request. There is no edit or delete
 * affordance, matching the backend's insert-only contract.
 */
export default function ClientRawDataPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const rawDataQuery = useRawData('mine', clientId);
  const contentQuery = useContentList('mine', clientId, 'ALL');
  const createMutation = useCreateRawData('mine', clientId);

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
        <Link
          href="/client"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to client dashboard
        </Link>
      </div>
    );
  }

  const handleSubmit = async (body: CreateRawDataRequest) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(body);
      setShowForm(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to submit your content request. Please try again.'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Content Requests
          </h2>
          <p className="text-sm text-slate-400">
            Send requests to your agency. Once sent, requests can&apos;t be
            edited or deleted.
          </p>
        </div>
        {!showForm && (
          <Button type="button" onClick={() => setShowForm(true)}>
            Submit Content Request
          </Button>
        )}
      </header>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit Content Request</CardTitle>
            <CardDescription>
              Tell your agency what you need. Your request is saved exactly as
              sent and can&apos;t be edited later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RawDataIntakeForm
              contentOptions={(contentQuery.data ?? []).map((item) => ({
                id: item.id,
                title: item.title,
              }))}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setServerError(null);
              }}
              isSubmitting={createMutation.isPending}
              error={serverError}
              submitLabel="Submit Content Request"
              submittingLabel="Submitting…"
            />
          </CardContent>
        </Card>
      )}

      {rawDataQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(rawDataQuery.error, 'Unable to load your requests.')}
        </div>
      ) : rawDataQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading your requests…</p>
          </CardContent>
        </Card>
      ) : (
        <RawDataList
          records={rawDataQuery.data}
          variant="client"
          title="My Requests"
          description="Your submitted requests. Your agency reviews each one and prepares drafts."
        />
      )}
    </div>
  );
}