'use client';

import Link from 'next/link';
import { AtSign, CheckCircle2, Clock3, FileText } from 'lucide-react';

import { ApiStatusCard } from '@/components/dashboard/api-status-card';
import { ClientActivityList } from '@/components/dashboard/client/client-activity-card';
import { ClientContentCard } from '@/components/dashboard/client/client-content-card';
import { ClientSocialAccountsCard } from '@/components/dashboard/client/client-social-accounts-card';
import { ClientStatusRail } from '@/components/dashboard/client/client-status-rail';
import { OverviewStatCard } from '@/components/dashboard/client/overview-stat-card';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContentList } from '@/hooks/use-content';
import { useMyClient, useMyHistory } from '@/hooks/use-client-overview';
import { useSocialAccounts } from '@/hooks/use-social-accounts';
import { describeApiError } from '@/lib/api-error-messages';

interface ClientOverviewProps {
  clientId: string;
}

/**
 * The client persona overview (the /dashboard client branch).
 *
 * Every metric is computed from a real API response — `GET /client/me`,
 * `GET /client/me/content`, `GET /client/me/social-accounts` and
 * `GET /client/me/history` — and nothing is fabricated (AGENTS.md §13):
 * while a query is pending the stat renders '—', and empty lists render
 * honest empty states. The ApiStatusCard stays the single glass surface of
 * this screen (APP-SIDE BLUR BUDGET, globals.css); all other panels use
 * surface-panel.
 */
export function ClientOverview({ clientId }: ClientOverviewProps) {
  const clientQuery = useMyClient(clientId);
  const contentQuery = useContentList('mine', clientId);
  const socialQuery = useSocialAccounts('mine', clientId);
  const historyQuery = useMyHistory(clientId);

  const content = contentQuery.data ?? [];
  const contentStats = {
    total: content.filter((item) => item.status !== 'ARCHIVED').length,
    underReview: content.filter(
      (item) =>
        item.status === 'IN_REVIEW' || item.status === 'CHANGES_REQUESTED',
    ).length,
    approved: content.filter((item) => item.status === 'APPROVED').length,
  };

  const accounts = socialQuery.data ?? [];
  const recentEvents = (historyQuery.data ?? []).slice(0, 5);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <StatGrid
          contentReady={Boolean(contentQuery.data)}
          socialReady={Boolean(socialQuery.data)}
          stats={contentStats}
          accountCount={accounts.length}
        />
        <HeroBanner />
        <div className="grid gap-4 lg:grid-cols-2">
          <ClientSocialAccountsCard
            accounts={accounts}
            isPending={socialQuery.isPending}
            error={socialQuery.error}
          />
          <ClientContentCard
            stats={contentStats}
            isPending={contentQuery.isPending}
            error={contentQuery.error}
          />
        </div>
        <ActivityCard
          isPending={historyQuery.isPending}
          error={historyQuery.error}
          events={recentEvents}
        />
      </div>

      <div className="flex flex-col gap-4">
        <ApiStatusCard />
        <ClientStatusRail
          client={clientQuery.data}
          isPending={clientQuery.isPending}
        />
      </div>
    </div>
  );
}

function StatGrid(props: {
  contentReady: boolean;
  socialReady: boolean;
  stats: { total: number; underReview: number; approved: number };
  accountCount: number;
}) {
  const { contentReady, socialReady, stats, accountCount } = props;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewStatCard
        icon={FileText}
        label="Total content"
        value={contentReady ? stats.total : '—'}
        hint="Excludes archived"
      />
      <OverviewStatCard
        icon={CheckCircle2}
        label="Approved · final"
        value={contentReady ? stats.approved : '—'}
        hint="Confirmed by you"
      />
      <OverviewStatCard
        icon={Clock3}
        label="Under review"
        value={contentReady ? stats.underReview : '—'}
        hint="Awaiting your decision"
      />
      <OverviewStatCard
        icon={AtSign}
        label="Recorded accounts"
        value={socialReady ? accountCount : '—'}
        hint="Metadata only — no credentials"
      />
    </div>
  );
}

function HeroBanner() {
  return (
    <section className="surface-panel relative overflow-hidden rounded-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-600/15 via-transparent to-transparent"
      />
      <div className="relative p-6">
        <h3 className="text-xl font-semibold tracking-tight text-slate-100">
          Let&apos;s grow your brand together!
        </h3>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Record your social platforms, review content shared with you, and
          confirm what is final — all in one place.
        </p>
        <Link
          href="/client/social-accounts"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}

function ActivityCard(props: {
  isPending: boolean;
  error: unknown;
  events: import('@/types/client').ClientEventDto[];
}) {
  const { isPending, error, events } = props;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <Link
          href="/client/notifications"
          className="text-sm text-blue-400 transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-slate-400">Loading activity…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-300">
            {describeApiError(error, 'Unable to load your activity.')}
          </p>
        ) : (
          <ClientActivityList events={events} />
        )}
      </CardContent>
    </Card>
  );
}