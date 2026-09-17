'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
  CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT,
  useClientChangeRequests,
  useClientContent,
  useConfirmFinalLock,
  useSubmitChangeRequest,
} from '@/hooks/use-content-operations';
import { describeApiError } from '@/lib/api-error-messages';

/**
 * Phase 4 (Integration) — Client review portal, wired to the real Phase 2 API.
 *
 * - Content renders from GET /client/me/content/:contentId.
 * - The change-request counter is the live `changeRequests` array length.
 * - "Submit change" POSTs .../change-requests and surfaces the 400
 *   CHANGE_REQUEST_LIMIT_EXCEEDED rejection when the Scenario-1 cap is hit.
 * - "Confirm & lock" POSTs .../final-confirmed-lock (only door to
 *   FINAL_CONFIRMED).
 */
export interface ClientReviewPortalProps {
  clientId: string;
  contentId: string;
}

export function ClientReviewPortal({ clientId, contentId }: ClientReviewPortalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const contentQuery = useClientContent(clientId, contentId);
  const changeRequestsQuery = useClientChangeRequests(clientId, contentId);
  const submitChange = useSubmitChangeRequest(clientId, contentId);
  const confirmLock = useConfirmFinalLock(clientId, contentId);

  const content = contentQuery.data ?? null;
  const changeRequests = changeRequestsQuery.data ?? [];
  const used = changeRequests.length;
  const isScenario1 = content?.scenarioType === 'SCENARIO_1';
  const remaining = isScenario1
    ? Math.max(0, CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT - used)
    : CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT;
  const percent = isScenario1
    ? Math.min(100, Math.round((used / CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT) * 100))
    : 0;
  const canRequest = !isScenario1 || remaining > 0;
  const isLocked = content?.status === 'FINAL_CONFIRMED';
  const configured = Boolean(clientId) && Boolean(contentId);

  async function handleSubmitChange() {
    setError(null);
    setSuccess(null);
    try {
      await submitChange.mutateAsync({ requestDetails: draft });
      setDraft('');
      setSuccess('Change request submitted.');
    } catch (err) {
      setError(describeApiError(err, 'Could not submit the change request.'));
    }
  }

  async function handleConfirmLock() {
    setError(null);
    setSuccess(null);
    try {
      await confirmLock.mutateAsync({});
      setSuccess('Content confirmed and locked.');
    } catch (err) {
      setError(describeApiError(err, 'Could not confirm and lock the content.'));
    }
  }

  if (isLocked) {
    return (
      <Card surface="glass">
        <CardHeader>
          <CardTitle className="text-base">Content confirmed and locked</CardTitle>
          <CardDescription>
            The content is now strictly immutable — no further revisions or
            change requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="success">Final confirmed</Badge>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card surface="glass">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Review portal</CardTitle>
          {content ? (
            <Badge variant="warning">{content.status.replaceAll('_', ' ')}</Badge>
          ) : null}
        </div>
        <CardDescription>
          Your agency prepared the content below. Request changes or confirm it
          as final.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!configured ? (
          <div role="status" className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            Pass a clientId and contentId to load this portal.
          </div>
        ) : null}
        {contentQuery.isLoading ? (
          <div role="status" className="text-sm text-slate-400">Loading content…</div>
        ) : null}
        {contentQuery.isError ? (
          <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {describeApiError(contentQuery.error, 'Could not load content.')}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : null}
        {success ? (
          <div role="status" className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
            {success}
          </div>
        ) : null}

        {content ? (
          <article className="rounded-md border border-white/[0.06] bg-slate-950/60 p-4">
            <p className="text-sm font-medium text-slate-100">{content.title}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-300">
              {content.body}
            </p>
          </article>
        ) : null}

        <Separator />

        <section aria-label="Change request allowance" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Change requests</h3>
            <Badge variant={remaining > 0 ? 'info' : 'danger'}>
              {isScenario1
                ? `${used} of ${CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT} change requests used`
                : `${used} change request${used === 1 ? '' : 's'}`}
            </Badge>
          </div>
          {isScenario1 ? (
            <div
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT}
              aria-label={`${used} of ${CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT} change requests used`}
              className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}

          {changeRequests.map((request) => (
            <div
              key={request.id}
              className="rounded-md border border-white/[0.06] bg-slate-950/60 px-3 py-2"
            >
              <p className="text-xs text-slate-400">{request.createdAt}</p>
              <p className="mt-1 text-sm text-slate-200">{request.requestDetails}</p>
            </div>
          ))}
          {isScenario1 ? (
            <p className="text-xs text-slate-400">
              {remaining > 0
                ? `You have ${remaining} change ${remaining === 1 ? 'request' : 'requests'} left on this content.`
                : 'You have used all change requests on this content.'}
            </p>
          ) : null}
        </section>

        <Separator />

        <section aria-label="Final confirmation" className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">Final confirmation</h3>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/[0.12] bg-white/[0.04] accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I understand this content becomes strictly immutable upon
            confirmation
          </label>
        </section>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <div className="flex w-full flex-col gap-2">
          <textarea
            aria-label="Change request details"
            className="min-h-20 w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            placeholder="Describe the change you would like…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={
                !configured ||
                !canRequest ||
                submitChange.isPending ||
                draft.trim().length === 0
              }
              onClick={() => void handleSubmitChange()}
            >
              {submitChange.isPending ? 'Submitting…' : 'Submit change'}
            </Button>
            <Button
              type="button"
              disabled={!configured || !acknowledged || confirmLock.isPending}
              onClick={() => void handleConfirmLock()}
            >
              {confirmLock.isPending ? 'Locking…' : 'Confirm and lock'}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

