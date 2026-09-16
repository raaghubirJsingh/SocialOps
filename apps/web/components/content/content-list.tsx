import Link from 'next/link';

import { ContentStatusBadge } from '@/components/content/content-status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ContentListProps {
  items: import('@/types/content').ContentDto[];
  /** Where each row links (agency detail vs client detail route). */
  detailHref: (contentId: string) => string;
  emptyDescription: string;
}

/**
 * Content list. Rows show the server-owned status and, once APPROVED, the fact
 * that a final confirmation exists — the revision id is shown short-form so it
 * is clear WHICH snapshot was approved.
 */
export function ContentList({
  items,
  detailHref,
  emptyDescription,
}: ContentListProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nothing here yet</CardTitle>
          <CardDescription>{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={detailHref(item.id)}
                  className="truncate text-sm font-medium text-slate-100 underline-offset-4 hover:underline"
                >
                  {item.title}
                </Link>
                <ContentStatusBadge status={item.status} />
              </div>
              <p className="line-clamp-2 text-xs text-slate-500">{item.body}</p>
              <p className="text-xs text-slate-500">
                Updated {new Date(item.updatedAt).toLocaleString()}
                {item.finalConfirmedAt
                  ? ` · confirmed ${new Date(item.finalConfirmedAt).toLocaleString()}`
                  : ''}
                {item.finalConfirmedRevisionId
                  ? ` · revision ${item.finalConfirmedRevisionId.slice(0, 8)}…`
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}