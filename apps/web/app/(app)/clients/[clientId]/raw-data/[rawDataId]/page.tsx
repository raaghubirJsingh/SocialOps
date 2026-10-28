'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { RawDataSummary } from '@/components/raw-data/raw-data-summary';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { rawDataApi } from '@/lib/raw-data-api';

/**
 * Agency-side intake detail (Client Operations V1).
 *
 * Read-only: RawData is immutable provenance. Any member who can list intake
 * may view one record; only OWNER/ADMIN see `Draft from intake` (UI hint —
 * the Content create endpoint remains authoritative).
 */
export default function AgencyClientRawDataDetailPage() {
  const { clientId, rawDataId } = useParams<{
    clientId: string;
    rawDataId: string;
  }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const orgReady = Boolean(activeOrganizationId && clientId && rawDataId);
  const detailQuery = useQuery({
    queryKey: [
      'raw-data',
      'detail',
      'agency',
      activeOrganizationId,
      clientId,
      rawDataId,
    ],
    queryFn: () => rawDataApi.getForClient(clientId, rawDataId),
    enabled: !sessionLoading && isAuthenticated && orgReady,
    retry: 0,
  });

  const activeMembership = membershipsQuery.data?.memberships.find(
    (membership) => membership.organization.id === activeOrganizationId,
  );
  const canManage =
    activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN';

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!orgReady) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          {membershipsQuery.isPending
            ? 'Loading your organizations…'
            : 'Select an organization first to manage client intake.'}
        </p>
        <Link
          href="/clients"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to clients
        </Link>
      </div>
    );
  }

  const record = detailQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientSectionNav clientId={clientId} active="raw-data" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Intake record
          </h2>
          <p className="text-sm text-slate-400">
            Immutable provenance. This record can never be edited or deleted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link href={`/clients/${clientId}/raw-data`}>Back to intake</Link>
          </Button>
          {canManage && record ? (
            <Button asChild>
              <Link href={`/clients/${clientId}/content?fromRawData=${record.id}`}>
                Draft from intake
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {detailQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(detailQuery.error, 'Unable to load this intake record.')}
        </div>
      ) : detailQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading intake record…</p>
          </CardContent>
        </Card>
      ) : record ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submitted material</CardTitle>
            <CardDescription className="font-mono text-xs">
              ID: {record.id}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RawDataSummary record={record} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
