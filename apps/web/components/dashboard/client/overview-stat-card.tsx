'use client';

import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

interface OverviewStatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
}

/**
 * One metric tile of the client overview. The value is ALWAYS sourced from a
 * real API response by the caller — this component renders numbers only and
 * never invents data (AGENTS.md §13). While the backing query is still
 * loading, callers pass '—' instead of a placeholder guess.
 */
export function OverviewStatCard({
  icon: Icon,
  label,
  value,
  hint,
}: OverviewStatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-100">
            {value}
          </p>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}