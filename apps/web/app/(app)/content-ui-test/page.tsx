'use client';

import { useState } from 'react';

import { ClientReviewPortal } from '@/components/content/client-review-portal';
import { ManagerWorkspace } from '@/components/content/manager-workspace';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

type PreviewTab = 'agency' | 'client';

const TABS: ReadonlyArray<{ id: PreviewTab; label: string }> = [
  { id: 'agency', label: 'Agency workspace' },
  { id: 'client', label: 'Client review portal' },
];

/**
 * Temporary Phase 3 preview page (UI-first, mock data only).
 *
 * Mounts the Agency workspace and the Client review portal in tabs so the
 * layout and the data-boundary split can be reviewed in the browser. Nothing
 * here calls the backend; backend wiring comes in a later phase.
 */
export default function ContentUiTestPage() {
  const [tab, setTab] = useState<PreviewTab>('agency');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Content UI preview
          </h2>
          <Badge variant="muted">Mock data — no backend wiring</Badge>
        </div>
        <p className="text-sm text-slate-400">
          Temporary review page for the Phase 3 dummy components. The Agency
          workspace keeps internal notes private; the Client portal never shows
          them.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Content preview"
        className="flex gap-2"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60',
              tab === entry.id
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-slate-600 hover:text-slate-200',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'agency' ? <ManagerWorkspace /> : <ClientReviewPortal />}
      </div>
    </div>
  );
}
