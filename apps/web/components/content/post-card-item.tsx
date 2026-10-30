'use client';

import Link from 'next/link';
import { memo } from 'react';

import { ContentStatusBadge } from '@/components/content/content-status-badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ContentDto } from '@/types/content';

export interface PostCardItemProps {
  item: ContentDto;
  detailHref: (contentId: string) => string;
  onEdit?: (contentId: string) => void;
  onDelete?: (contentId: string) => void;
}

function PostCardItemComponent({
  item,
  detailHref,
  onEdit,
  onDelete,
}: PostCardItemProps) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={detailHref(item.id)}
              className="truncate rounded text-sm font-medium text-slate-100 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              {item.title}
            </Link>
            <ContentStatusBadge status={item.status} />
          </div>
          <p className="line-clamp-2 text-xs text-slate-400">{item.body}</p>
          <p className="text-xs text-slate-400">
            Updated {new Date(item.updatedAt).toLocaleString()}
            {item.finalConfirmedAt
              ? ` · confirmed ${new Date(item.finalConfirmedAt).toLocaleString()}`
              : ''}
            {item.finalConfirmedRevisionId
              ? ` · revision ${item.finalConfirmedRevisionId.slice(0, 8)}…`
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(item.id)}
              className="text-xs text-blue-400 hover:underline"
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="text-xs text-red-400 hover:underline"
            >
              Delete
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export const PostCardItem = memo(PostCardItemComponent);