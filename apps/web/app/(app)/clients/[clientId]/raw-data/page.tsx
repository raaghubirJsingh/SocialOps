'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { RawDataIntakeForm } from '@/components/raw-data/raw-data-intake-form';
import { RawDataList } from '@/components/raw-data/raw-data-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useContentList } from '@/hooks/use-content';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useCreateRawData, useRawData } from '@/hooks/use-raw-data';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import type { CreateRawDataRequest } from '@/types/content';

/**
 * Agency-side RawData intake for one Client (Client Operations V1).
 *
 * INSERT-ONLY: the only affordance is "Record intake". There is no edit or
 * delete control because no such route exists. Intake is paste-only (no file
 * upload), the integrity hash is server-computed, and a record may optionally
 * be linked to one of this client's Content items - the same-client rule is
 * enforced server-side (a foreign contentId is a uniform 404).
 */
export default function AgencyClientRawDataPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const rawDataQuery = useRawData('agency', clientId);
  const contentQuery = useContentList('agency', clientId, 'ALL');
  const createMutation = useCreateRawData('agency', clientId);

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

  if (!activeOrganizationId || !clientId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          Select an organization first to manage client intake.
        </p>
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  const handleSubmit = async (body: CreateRawDataRequest) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(body);
      setShowForm(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to record the intake. Please try again.'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientSectionNav clientId={clientId} active="raw-data" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">Raw data</h2>
          <p className="text-sm text-slate-400">
            Immutable intake records for this client. Insert-only: rows can never
            be edited or deleted.
          </p>
        </div>
        {canManage && !showForm && (
          <Button type="button" onClick={() => setShowForm(true)}>
            Record intake
          </Button>
        )}
      </header>

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record intake</CardTitle>
            <CardDescription>
              Paste text and/or provide metadata. The integrity hash is computed
              server-side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RawDataIntakeForm
              contentOptions={(contentQuery.data ?? []).map((item) => ({
                id: item.id,
                title: item.title,
              }))}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setServerError(null);
              }}
              isSubmitting={createMutation.isPending}
              error={serverError}
            />
          </CardContent>
        </Card>
      )}

      {rawDataQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(rawDataQuery.error, 'Unable to load intake records.')}
        </div>
      ) : rawDataQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading intake records…</p>
          </CardContent>
        </Card>
      ) : (
        <RawDataList records={rawDataQuery.data} />
      )}
    </div>
  );
}