'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { availableTransitionsFor, canArchive } from '@/lib/content-status';
import type { ContentActor, ContentDto } from '@/types/content';

interface ContentStatusActionsProps {
  content: ContentDto;
  actor: ContentActor;
  onTransition: (input: { to: string; note?: string }) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  /** Disables every control (e.g. while another mutation is in flight). */
  disabled?: boolean;
}

/**
 * Renders ONLY the transitions the (status × actor) matrix allows, derived from
 * the frozen mirror in `lib/content-status.ts`.
 *
 * This is a UX convenience, never a security boundary (AGENTS.md section 7):
 * the server re-validates the whitelist AND the actor authority on every call,
 * and the caller must surface a 403/409. There is deliberately no APPROVED
 * control here for ANY actor - Final Confirmation is a separate, client-only
 * flow with its own component and endpoint.
 */
export function ContentStatusActions({
  content,
  actor,
  onTransition,
  isSubmitting,
  error,
  disabled,
}: ContentStatusActionsProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const options = availableTransitionsFor(actor, content.status);
  const archiveAllowed = canArchive(actor, content.status);
  const isReadOnly = content.status === 'ARCHIVED';

  if (isReadOnly) {
    return (
      <p className="text-sm text-slate-400">
        This item is archived. Archived content is terminal in this phase.
      </p>
    );
  }

  const runTransition = async (to: string) => {
    setPendingTarget(to);
    try {
      await onTransition({ to, note: note.trim().length > 0 ? note.trim() : undefined });
      setNote('');
      setArchiveOpen(false);
    } finally {
      setPendingTarget(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.to}
            type="button"
            size="sm"
            variant={option.to === 'CHANGES_REQUESTED' ? 'destructive' : 'default'}
            disabled={isSubmitting || disabled || pendingTarget !== null}
            onClick={() => void runTransition(option.to)}
          >
            {pendingTarget === option.to ? 'Working…' : option.label}
          </Button>
        ))}

        {archiveAllowed && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isSubmitting || disabled || pendingTarget !== null}
            onClick={() => setArchiveOpen(true)}
          >
            Archive
          </Button>
        )}
      </div>

      {options.length === 0 && !archiveAllowed && (
        <p className="text-sm text-slate-400">
          No status change is available to your role in the current state.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <Dialog
        open={archiveOpen}
        title="Archive this item?"
        description="Archived content is terminal in this phase and cannot be edited afterwards."
        onClose={() => setArchiveOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setArchiveOpen(false)}
              disabled={pendingTarget !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendingTarget !== null}
              onClick={() => void runTransition('ARCHIVED')}
            >
              {pendingTarget === 'ARCHIVED' ? 'Archiving…' : 'Archive'}
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          <Label htmlFor="archive-note" className="text-sm text-slate-300">
            Note <span className="text-slate-500">(optional)</span>
          </Label>
          <Textarea
            id="archive-note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pendingTarget !== null}
          />
        </div>
      </Dialog>
    </div>
  );
}