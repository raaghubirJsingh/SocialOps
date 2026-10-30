'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { PostCardItem } from '@/components/content/post-card-item';
import type { ContentDto } from '@/types/content';

export interface VirtualizedSocialFeedProps {
  items: ContentDto[];
  detailHref: (contentId: string) => string;
  onEdit?: (contentId: string) => void;
  onDelete?: (contentId: string) => void;
  estimateSize?: number;
}

export function VirtualizedSocialFeed({
  items,
  detailHref,
  onEdit,
  onDelete,
  estimateSize = 120,
}: VirtualizedSocialFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="h-[600px] overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              <PostCardItem
                item={item}
                detailHref={detailHref}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}