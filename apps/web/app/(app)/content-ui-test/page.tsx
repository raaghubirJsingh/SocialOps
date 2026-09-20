'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

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
 * Temporary Phase 4 preview page (wired to the real Phase 2 API).
 *
 * Mounts the Agency workspace and the Client review portal in tabs. Read the
 * `clientId` and `contentId` query parameters (e.g.
 * /content-ui-test?clientId=...&contentId=...) to preview a real item. Both
 * components degrade gracefully to a "pass a clientId/contentId" notice when
 * the parameters are absent.
 *
 * The AI employee list for the Smart Assignment dropdown is fetched live by the
 * ManagerWorkspace via GET /api/organizations/ai-members, so the dropdown is
 * populated with the organization's real AI bots from the database.
 */
// Hidden from dashboard navigation and restricted to development only
// (AGENTS.md §13 — content UI preview is a Phase 4 dev tool).
const isDevOnly = process.env.NODE_ENV !== 'development';

export default function ContentUiTestPage() {
  const [tab, setTab] = useState<PreviewTab>('agency');
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const contentId = searchParams.get('contentId') ?? '';

  // Return early in production: the page content is never sent to regular
  // users. Hidden from the sidebar navigation array; this guard covers
  // direct-URL access too.
  if (isDevOnly) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Content UI preview
          </h2>
          <Badge variant="info">Wired to Phase 2 API</Badge>
        </div>
        <p className="text-sm text-slate-400">
          Pass <code className="text-slate-300">?clientId=…&amp;contentId=…</code> to
          preview a real item. The Agency workspace keeps internal notes private;
          the Client portal never shows them.
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
        {tab === 'agency' ? (
          <ManagerWorkspace clientId={clientId} contentId={contentId} />
        ) : (
          <ClientReviewPortal clientId={clientId} contentId={contentId} />
        )}
      </div>
    </div>
  );
}
