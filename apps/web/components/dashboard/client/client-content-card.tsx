'use client';

import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { describeApiError } from '@/lib/api-error-messages';

export interface ContentOverviewStats {
  total: number;
  underReview: number;
  approved: number;
}

interface ClientContentCardProps {
  stats: ContentOverviewStats;
  isPending: boolean;
  error: unknown;
}

/**
 * Content snapshot for the client persona. Every number is computed from
 * the real `GET /client/me/content` response by the caller — this card only
 * presents them. "Approved · final" reflects the APPROVED status, which in
 * V1 is reachable ONLY through the client-owner final confirmation (the
 * approval gate itself); publishing is still a deferred module.
 */
export function ClientContentCard({
  stats,
  isPending,
  error,
}: ClientContentCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-blue-400" aria-hidden="true" />
            Content
          </CardTitle>
          <Link
            href="/client/content"
            className="flex items-center text-sm text-blue-400 transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Review
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <CardDescription>
          Items shared with you — you approve what is final.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-slate-400">Loading content…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-300">
            {describeApiError(error, 'Unable to load your content.')}
          </p>
        ) : (
          <dl className="space-y-2.5">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm text-slate-300">
                <span
                  className="h-2 w-2 rounded-full bg-blue-400"
                  aria-hidden="true"
                />
                Current content
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-100">
                {stats.total}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm text-slate-300">
                <span
                  className="h-2 w-2 rounded-full bg-amber-400"
                  aria-hidden="true"
                />
                Under review
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-100">
                {stats.underReview}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm text-slate-300">
                <span
                  className="h-2 w-2 rounded-full bg-emerald-400"
                  aria-hidden="true"
                />
                Approved · final
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-100">
                {stats.approved}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}