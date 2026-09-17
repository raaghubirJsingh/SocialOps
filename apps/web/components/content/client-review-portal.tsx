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
  MOCK_CHANGE_REQUEST_LIMIT,
  MOCK_CHANGE_REQUESTS_USED,
  MOCK_POLISHED_CONTENT,
} from '@/components/content/phase3-mocks';

/**
 * Phase 3 (UI-first) Client review portal preview.
 *
 * Mock data only — no backend calls. Visualises the client side of the
 * pipeline: polished content, the Scenario 1 change-request counter, and the
 * final-confirmation gate.
 *
 * STRICT BOUNDARY: this file must never render internal notes or the agency
 * id. It imports only the polished content and the change-request fixtures.
 */
export function ClientReviewPortal() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const used = MOCK_CHANGE_REQUESTS_USED.length;
  const remaining = MOCK_CHANGE_REQUEST_LIMIT - used;
  const percent = Math.round((used / MOCK_CHANGE_REQUEST_LIMIT) * 100);

  if (confirmed) {
    return (
      <Card surface="glass">
        <CardHeader>
          <CardTitle className="text-base">Content confirmed and locked</CardTitle>
          <CardDescription>
            Mock confirmation recorded. The content is now strictly immutable —
            no further revisions or change requests.
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
          <Badge variant="warning">
            {MOCK_POLISHED_CONTENT.status.replaceAll('_', ' ')}
          </Badge>
        </div>
        <CardDescription>
          Your agency prepared the content below. Request changes or confirm it
          as final.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <article className="rounded-md border border-white/[0.06] bg-slate-950/60 p-4">
          <p className="text-sm font-medium text-slate-100">
            {MOCK_POLISHED_CONTENT.title}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-300">
            {MOCK_POLISHED_CONTENT.body}
          </p>
        </article>

        <Separator />

        {/* Change-request counter (Scenario 1: max 2) */}
        <section aria-label="Change request allowance" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Change requests
            </h3>
            <Badge variant={remaining > 0 ? 'info' : 'danger'}>
              {used} of {MOCK_CHANGE_REQUEST_LIMIT} change requests used
            </Badge>
          </div>
          <div
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={MOCK_CHANGE_REQUEST_LIMIT}
            aria-label={`${used} of ${MOCK_CHANGE_REQUEST_LIMIT} change requests used`}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          {MOCK_CHANGE_REQUESTS_USED.map((request) => (
            <div
              key={request.id}
              className="rounded-md border border-white/[0.06] bg-slate-950/60 px-3 py-2"
            >
              <p className="text-xs text-slate-400">{request.createdAt}</p>
              <p className="mt-1 text-sm text-slate-200">{request.details}</p>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            {remaining > 0
              ? `You have ${remaining} change ${remaining === 1 ? 'request' : 'requests'} left on this content.`
              : 'You have used all change requests on this content.'}
          </p>
        </section>

        <Separator />

        {/* Final confirmation gate */}
        <section aria-label="Final confirmation" className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Final confirmation
          </h3>
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
        <Button type="button" variant="secondary" disabled={remaining === 0}>
          Request a change (mock)
        </Button>
        <Button
          type="button"
          disabled={!acknowledged}
          onClick={() => setConfirmed(true)}
        >
          Confirm and lock
        </Button>
      </CardFooter>
    </Card>
  );
}
