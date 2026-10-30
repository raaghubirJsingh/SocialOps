'use client';

import { memo } from 'react';

import type { ContentDto } from '@/types/content';

export interface CalendarDayCellProps {
  date: string;
  posts: ContentDto[];
  isSelected?: boolean;
  onSelect?: (date: string) => void;
}

function CalendarDayCellComponent({
  date,
  posts,
  isSelected = false,
  onSelect,
}: CalendarDayCellProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(date)}
      className={`min-h-[80px] w-full rounded-md border p-2 text-left ${
        isSelected ? 'border-blue-500 bg-blue-950/30' : 'border-slate-800'
      }`}
    >
      <div className="text-xs font-medium text-slate-300">{date}</div>
      <div className="mt-1 space-y-1">
        {posts.map((post) => (
          <div
            key={post.id}
            className="truncate text-[10px] text-slate-400"
          >
            {post.title}
          </div>
        ))}
      </div>
    </button>
  );
}

export const CalendarDayCell = memo(CalendarDayCellComponent);