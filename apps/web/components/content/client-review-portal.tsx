'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  useClientChangeRequests,
  useClientContent,
  useConfirmFinalLock,
  useSubmitChangeRequest,
} from '@/hooks/use-content-operations';
import { describeApiError } from '@/lib/api-error-messages';

export interface ClientReviewPortalProps {
  clientId: string;
  contentId: string;
}

const CLIENT_STATE_LABELS = {
  draft_in_progress: 'Draft in progress',
  ready_for_review: 'Ready for your review',
  confirmed: 'Content confirmed',
  closed: 'Closed',
} as const;

export function ClientReviewPortal({
  clientId,
  contentId,
}: ClientReviewPortalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const contentQuery = useClientContent(clientId, contentId);
  const changeRequestsQuery = useClientChangeRequests(clientId, contentId);
  const submitChange = useSubmitChangeRequest(clientId, contentId);
  const confirmContent = useConfirmFinalLock(clientId, contentId);

  const content = contentQuery.data ?? null;
  const changeRequests = changeRequestsQuery.data ?? [];
  const configured = Boolean(clientId) && Boolean(contentId);

  async function handleSubmitChange() {
    setError(null);
    setSuccess(null);
    try {
      await submitChange.mutateAsync({ requestDetails: draft });
      setDraft('');
      setSuccess('Your change request has been sent.');
    } catch (err) {
      setError(describeApiError(err, 'Could not submit the change request.'));
    }
  }

  async function handleConfirmContent() {
    setError(null);
    setSuccess(null);
    try {
      await confirmContent.mutateAsync({});
      setSuccess('Content confirmed.');
    } catch (err) {
      setError(describeApiError(err, 'Could not confirm the content.'));
    }
  }

  return (
    <Card surface="glass">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Your content</CardTitle>
          {content ? (
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-xs text-slate-300">
              {CLIENT_STATE_LABELS[content.state]}
            </span>
          ) : null}
        </div>
        <CardDescription>
          Review the latest draft from your SocialOps team and choose what
          happens next.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!configured ? (
          <div
            role="status"
            className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300"
          >
            A client and content request are needed to load this review.
          </div>
        ) : null}
        {contentQuery.isLoading ? (
          <div role="status" className="text-sm text-slate-400">
            Loading draft…
          </div>
        ) : null}
        {contentQuery.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300"
          >
            {describeApiError(contentQuery.error, 'Could not load the draft.')}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300"
          >
            {success}
          </div>
        ) : null}

        {content ? (
          <article className="rounded-md border border-white/[0.06] bg-slate-950/60 p-4">
            <h3 className="text-sm font-medium text-slate-100">
              {content.title}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
              {content.body}
            </p>
          </article>
        ) : null}

        <Separator />

        <section aria-label="Your change requests" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Change requests
            </h3>
            <span className="text-xs text-slate-400">
              {changeRequests.length}{' '}
              {changeRequests.length === 1 ? 'request sent' : 'requests sent'}
            </span>
          </div>
          {changeRequests.map((request) => (
            <div
              key={request.id}
              className="rounded-md border border-white/[0.06] bg-slate-950/60 px-3 py-2"
            >
              <p className="text-xs text-slate-400">
                {new Date(request.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {request.requestDetails}
              </p>
            </div>
          ))}
        </section>

        {content?.canRequestChanges ? (
          <>
            <Separator />
            <section aria-label="Request changes" className="space-y-3">
              <label
                htmlFor="change-request-details"
                className="text-sm font-semibold text-slate-100"
              >
                Request Changes
              </label>
              <textarea
                id="change-request-details"
                className="min-h-20 w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                placeholder="Describe what you would like changed…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </section>
          </>
        ) : null}

        {content?.canConfirmContent ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/[0.12] bg-white/[0.04] accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I am happy with this content and want to confirm it.
          </label>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {content?.canRequestChanges ? (
          <Button
            type="button"
            variant="secondary"
            disabled={
              !configured ||
              submitChange.isPending ||
              draft.trim().length === 0
            }
            onClick={() => void handleSubmitChange()}
          >
            {submitChange.isPending ? 'Sending…' : 'Request Changes'}
          </Button>
        ) : null}
        {content?.canConfirmContent ? (
          <Button
            type="button"
            disabled={
              !configured || !acknowledged || confirmContent.isPending
            }
            onClick={() => void handleConfirmContent()}
          >
            {confirmContent.isPending ? 'Confirming…' : 'Confirm Content'}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
