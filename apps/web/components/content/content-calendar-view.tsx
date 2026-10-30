'use client';

import { useCallback, useState } from 'react';

import { CalendarDayCell } from '@/components/content/calendar-day-cell';
import type { ContentDto } from '@/types/content';

export interface ContentCalendarViewProps {
  days: { date: string; posts: ContentDto[] }[];
}

export function ContentCalendarView({ days }: ContentCalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => (
        <CalendarDayCell
          key={day.date}
          date={day.date}
          posts={day.posts}
          isSelected={selectedDate === day.date}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}