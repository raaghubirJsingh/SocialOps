import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ContentRevisionDto } from '@/types/content';

/**
 * Insert-only revision history (newest first).
 *
 * Revisions are immutable snapshots and there is no route that can modify or
 * delete them, so this list is strictly read-only. The short content hash is
 * shown so it can be compared with the revision referenced by a confirmation.
 */
export function ContentRevisionList({
  revisions,
}: {
  revisions: ContentRevisionDto[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revisions</CardTitle>
        <CardDescription>
          Immutable snapshots of this item, newest first. Every edit and every final
          confirmation appends one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {revisions.length === 0 ? (
          <p className="text-sm text-slate-400">No revisions recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-200">
                    Revision {revision.revision}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    sha256:{revision.contentHash.slice(0, 12)}…
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {revision.title} ·{' '}
                  {new Date(revision.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}