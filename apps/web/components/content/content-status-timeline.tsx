import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { timelineStepFor } from '@/lib/content-status';
import type { ContentStatus } from '@/types/content';

const STEPS = ['Draft', 'In review', 'Approved'] as const;

interface ContentStatusTimelineProps {
  status: ContentStatus;
  /** Confirmation metadata, shown only once the item is APPROVED. */
  confirmedAt?: string | null;
  confirmedRevisionId?: string | null;
  className?: string;
}

/**
 * Visual representation of the approved Content state machine:
 *
 *   [Draft] -> [In review] -> [Approved]
 *                   ^  |
 *                   |  v
 *            [Changes requested]        [Archived]
 *
 * `CHANGES_REQUESTED` is rendered as a LOOP-BACK branch rather than a forward
 * step, because it returns the item to review; `ARCHIVED` is a terminal chip
 * reachable from Draft / Changes requested / Approved.
 *
 * APPROVED renders with its confirmation details because it is terminal in V1
 * (the Publishing engine is deferred): only an edit can undo it, which resets
 * the item to Draft and clears the confirmation.
 *
 * The step index comes from the frozen mirror in `lib/content-status.ts`; the
 * backend remains the authority for what any actor may actually do.
 */
export function ContentStatusTimeline({
  status,
  confirmedAt,
  confirmedRevisionId,
  className,
}: ContentStatusTimelineProps) {
  const current = timelineStepFor(status);
  const isArchived = status === 'ARCHIVED';
  const isChangesRequested = status === 'CHANGES_REQUESTED';

  return (
    <div className={cn('space-y-3', className)}>
      <ol className="flex flex-wrap items-center gap-2" aria-label="Content status">
        {STEPS.map((label, index) => {
          const isCurrent = !isArchived && index === current;
          const isDone = !isArchived && index < current;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                  isCurrent
                    ? 'border-blue-800 bg-blue-950/50 text-blue-200'
                    : isDone
                      ? 'border-slate-700 bg-slate-800 text-slate-300'
                      : 'border-slate-800 bg-slate-900 text-slate-500',
                )}
              >
                <span aria-hidden="true">{isDone ? '✓' : index + 1}</span>
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-slate-600">
                  →
                </span>
              )}
            </li>
          );
        })}

        {isArchived && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-slate-600">
              |
            </span>
            <Badge variant="muted" aria-current="step">
              Archived
            </Badge>
          </li>
        )}
      </ol>

      {isChangesRequested && (
        <p className="text-xs text-rose-300">
          Changes requested — the client returned this item for edits. Edit it and
          resubmit for review.
        </p>
      )}

      {status === 'APPROVED' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Badge variant="success">Final confirmation recorded</Badge>
          {confirmedAt && <span>Confirmed {new Date(confirmedAt).toLocaleString()}</span>}
          {confirmedRevisionId && (
            <span className="font-mono text-slate-500">
              revision {confirmedRevisionId.slice(0, 8)}…
            </span>
          )}
          <span className="text-slate-500">
            Editing this text will return it to Draft and clear the confirmation.
          </span>
        </div>
      )}
    </div>
  );
}