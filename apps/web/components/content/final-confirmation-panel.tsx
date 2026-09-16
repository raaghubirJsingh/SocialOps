'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { canFinalConfirm } from '@/lib/content-status';
import type { ContentDto } from '@/types/content';

interface FinalConfirmationPanelProps {
  content: ContentDto;
  /** Revision number the confirmation would pin (from the revisions query). */
  latestRevision?: number;
  /** Short sha of that revision, shown so the owner knows what they approve. */
  latestRevisionHash?: string;
  onConfirm: (note?: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * FINAL CONFIRMATION - the only door to APPROVED.
 *
 * This component is rendered EXCLUSIVELY by the client self-service content
 * detail page. No agency route imports it, and the agency API surface has no
 * equivalent call, so the UI has no path that could approve on the agency's
 * behalf.
 *
 * Gating (defence in depth - AGENTS.md section 7 makes the server the only
 * authority):
 *   1. it renders only when the item is IN_REVIEW, otherwise it explains why;
 *   2. the owner must tick an explicit acknowledgment of the exact revision;
 *   3. the request carries `X-Client-Id`, which the backend re-verifies against
 *      `Client.ownerUserId` + onboarding ACTIVE on every call;
 *   4. the server (and the DB CHECK constraint) refuse an APPROVED row without
 *      the complete confirmation triple.
 *
 * The action is treated as consequential: it is two-step because only an edit
 * can undo it, and that edit returns the item to Draft and clears the
 * confirmation.
 */
export function FinalConfirmationPanel({
  content,
  latestRevision,
  latestRevisionHash,
  onConfirm,
  isSubmitting,
  error,
}: FinalConfirmationPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');

  const allowed = canFinalConfirm(content.status);

  if (content.status === 'APPROVED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final confirmation recorded</CardTitle>
          <CardDescription>
            You approved this text
            {content.finalConfirmedAt
              ? ` on ${new Date(content.finalConfirmedAt).toLocaleString()}`
              : ''}
            . Editing it later will return it to Draft and clear this
            confirmation, so it must be confirmed again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Approved</Badge>
          {content.finalConfirmedRevisionId && (
            <span className="font-mono text-xs text-slate-500">
              revision {content.finalConfirmedRevisionId.slice(0, 8)}…
            </span>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Final confirmation</CardTitle>
        <CardDescription>
          Approving is a client-owner action. It records this exact text as the
          final version — the only way an item can reach Approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!allowed ? (
          <p className="text-sm text-slate-400">
            Final confirmation requires the item to be <strong>In review</strong>.
            Submit it for review first.
          </p>
        ) : (
          <>
            {latestRevision !== undefined && (
              <p className="text-xs text-slate-400">
                You are confirming revision {latestRevision}
                {latestRevisionHash
                  ? ` (sha256:${latestRevisionHash.slice(0, 12)}…)`
                  : ''}
                .
              </p>
            )}

            <div className="grid gap-2">
              <label
                htmlFor="confirm-note"
                className="text-sm text-slate-300"
              >
                Note <span className="text-slate-500">(optional)</span>
              </label>
              <Textarea
                id="confirm-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={isSubmitting}
              />
              I confirm this exact text is final and ready to be published once a
              publishing phase exists.
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <Button
              type="button"
              disabled={!acknowledged || isSubmitting}
              onClick={() =>
                void onConfirm(note.trim().length > 0 ? note.trim() : undefined)
              }
            >
              {isSubmitting ? 'Confirming…' : 'Grant final confirmation'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}