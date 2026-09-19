'use client';

import { Activity } from 'lucide-react';

import { describeClientEvent } from '@/lib/client-event-labels';
import type { ClientEventDto } from '@/types/client';

interface ClientActivityListProps {
  events: ClientEventDto[];
  emptyLabel?: string;
}

/**
 * Renders the client's REAL audit-trail events (insert-only, server-owned).
 * There are no fabricated entries: an empty list renders an honest empty
 * state, and unknown future actions fall through to the neutral prettifier
 * in lib/client-event-labels.ts.
 */
export function ClientActivityList({
  events,
  emptyLabel = 'No activity yet.',
}: ClientActivityListProps) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y divide-white/[0.04]">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-slate-300">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-200">
              {describeClientEvent(event.action)}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(event.createdAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}