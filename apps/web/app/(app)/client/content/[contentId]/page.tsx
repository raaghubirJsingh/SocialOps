'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ContentForm } from '@/components/content/content-form';
import { ContentRevisionList } from '@/components/content/content-revision-list';
import { ContentStatusActions } from '@/components/content/content-status-actions';
import { ContentStatusEventList } from '@/components/content/content-status-event-list';
import { ContentStatusTimeline } from '@/components/content/content-status-timeline';
import { FinalConfirmationPanel } from '@/components/content/final-confirmation-panel';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useConfirmFinalContent,
  useContentDetail,
  useContentRevisions,
  useContentStatusEvents,
  useTransitionContent,
  useUpdateContent,
} from '@/hooks/use-content';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { isEditable } from '@/lib/content-status';
import type { ContentTransitionTarget } from '@/types/content';

/**
 * Client self-service: my Content detail (the CLIENT OWNER surface).
 *
 * This is the ONLY page in the app that hosts Final Confirmation. The owner may:
 *   - edit the text (DRAFT / CHANGES_REQUESTED only);
 *   - submit or resubmit for review, and request changes (client-owner-only
 *     review decision);
 *   - grant FINAL CONFIRMATION, which is the single door to APPROVED.
 *
 * `clientId` comes from the query string as a lookup hint only; the backend
 * re-verifies the ownership binding on every request, and an agency session
 * cannot reach this page's actions because the agency API client exposes no
 * confirm call at all.
 */
export default function ClientContentDetailPage() {
  const params = useParams<{ contentId: string }>();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const contentId = params.contentId;
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const detailQuery = useContentDetail('mine', clientId, contentId);
  const revisionsQuery = useContentRevisions('mine', clientId, contentId);
  const eventsQuery = useContentStatusEvents('mine', clientId, contentId);
  const updateMutation = useUpdateContent('mine', clientId);
  const transitionMutation = useTransitionContent('mine', clientId);
  const confirmMutation = useConfirmFinalContent(clientId);

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

  const handleSave = async (values: { title: string; body: string }) => {
    setServerError(null);
    try {
      const expectedRevision = revisionsQuery.data?.[0]?.revision;
      await updateMutation.mutateAsync({
        contentId,
        body: { ...values, ...(expectedRevision ? { expectedRevision } : {}) },
      });
      setIsEditing(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to save this content. Please try again.'),
      );
    }
  };

  const handleTransition = async (input: { to: string; note?: string }) => {
    setServerError(null);
    try {
      await transitionMutation.mutateAsync({
        contentId,
        body: { to: input.to as ContentTransitionTarget, note: input.note },
      });
    } catch (error) {
      setServerError(
        describeApiError(error, 'That status change was not accepted.'),
      );
    }
  };

  const handleConfirm = async (note?: string) => {
    setConfirmError(null);
    try {
      await confirmMutation.mutateAsync({ contentId, body: { note } });
    } catch (error) {
      setConfirmError(
        describeApiError(error, 'Unable to record the final confirmation.'),
      );
    }
  };

  const backHref = `/client/content?clientId=${clientId}`;

  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(detailQuery.error, 'Unable to load this content item.')}
        </div>
        <Link href={backHref} className="text-sm text-blue-400 hover:underline">
          ← Back to content
        </Link>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading content…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = detailQuery.data;
  const editable = isEditable(content.status);
  const latestRevision = revisionsQuery.data?.[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href={backHref} className="text-sm text-blue-400 hover:underline">
          ← Back to content
        </Link>
        <h2 className="text-2xl font-semibold text-slate-100">{content.title}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
          <CardDescription>
            Your review decides whether this text is final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ContentStatusTimeline
            status={content.status}
            confirmedAt={content.finalConfirmedAt}
            confirmedRevisionId={content.finalConfirmedRevisionId}
          />
          <ContentStatusActions
            content={content}
            actor="CLIENT_OWNER"
            onTransition={handleTransition}
            isSubmitting={transitionMutation.isPending || updateMutation.isPending}
            error={serverError}
            disabled={isEditing}
          />
        </CardContent>
      </Card>

      {/* The ONLY Final Confirmation surface in the application. */}
      <FinalConfirmationPanel
        content={content}
        latestRevision={latestRevision?.revision}
        latestRevisionHash={latestRevision?.contentHash}
        onConfirm={handleConfirm}
        isSubmitting={confirmMutation.isPending}
        error={confirmError}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Text</CardTitle>
            <CardDescription>
              {editable
                ? 'You can edit this text; each save appends a new revision.'
                : 'This item cannot be edited in its current status.'}
            </CardDescription>
          </div>
          {editable && !isEditing && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setServerError(null);
                setIsEditing(true);
              }}
            >
              Edit text
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <ContentForm
              mode="edit"
              initial={content}
              onSubmit={handleSave}
              onCancel={() => {
                setIsEditing(false);
                setServerError(null);
              }}
              isSubmitting={updateMutation.isPending}
              error={serverError}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-slate-200">
              {content.body}
            </p>
          )}
        </CardContent>
      </Card>

      {revisionsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading revisions…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentRevisionList revisions={revisionsQuery.data ?? []} />
      )}

      {eventsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading status history…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentStatusEventList events={eventsQuery.data ?? []} />
      )}
    </div>
  );
}