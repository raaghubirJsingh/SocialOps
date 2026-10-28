'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { ClientContextHeader } from '@/components/clients/client-context-header';
import { ContentForm } from '@/components/content/content-form';
import { ContentList } from '@/components/content/content-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import {
  useContentList,
  useCreateContent,
  useCreateContentFromRequest,
} from '@/hooks/use-content';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { describeApiError } from '@/lib/api-error-messages';
import { cn } from '@/lib/cn';
import { deriveDraftPrefill, rawDataApi } from '@/lib/raw-data-api';
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
  type RawDataDto,
} from '@/types/content';

/**
 * Agency-side Content list + draft creation (Client Operations V1).
 *
 * Status filter chips are plain Tailwind (no tabs primitive), and pagination is
 * the approved fixed `take=50` (D8) - there is no pager in V1.
 *
 * Creating is gated to OWNER/ADMIN as a UI convenience; the backend RoleGuard
 * remains authoritative. Every item is created as DRAFT: `status` is not part
 * of the creation contract.
 */
export default function AgencyClientContentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-6">
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      }
    >
      <AgencyClientContentBody />
    </Suspense>
  );
}

function AgencyClientContentBody() {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const fromRawDataId = searchParams.get('fromRawData') ?? '';
  const [intake, setIntake] = useState<RawDataDto | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(false);

  const [intakeRequest, setIntakeRequest] = useState<{
    key: string;
    clientId: string;
    rawDataId: string;
  } | null>(null);
  const intakeRequestKey = `${clientId ?? ''}::${fromRawDataId}`;

  // React-documented "adjust state during render" pattern (same as
  // use-active-organization.tsx): when the requested intake changes, queue the
  // reset during render instead of calling setState synchronously inside the
  // fetch effect, which the React Compiler rule forbids.
  if (
    fromRawDataId &&
    clientId &&
    isAuthenticated &&
    intakeRequest?.key !== intakeRequestKey
  ) {
    setIntakeRequest({ key: intakeRequestKey, clientId, rawDataId: fromRawDataId });
    setIntake(null);
    setIntakeError(null);
    setIntakeLoading(true);
    setShowCreate(true);
  }

  useEffect(() => {
    if (!intakeRequest) {
      return;
    }
    let cancelled = false;
    rawDataApi
      .getForClient(intakeRequest.clientId, intakeRequest.rawDataId)
      .then((record) => {
        if (cancelled) return;
        // Re-verified server-side: the record carries this clientId or the
        // fetch 404s. Never trust the query param as authority.
        setIntake(record.clientId === intakeRequest.clientId ? record : null);
        if (record.clientId !== intakeRequest.clientId) {
          setIntakeError('That intake does not belong to this client.');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setIntakeError(
          describeApiError(error, 'Unable to load that intake record.'),
        );
      })
      .finally(() => {
        if (!cancelled) setIntakeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intakeRequest]);

  const prefill = intake ? deriveDraftPrefill(intake) : null;

  const orgReady = Boolean(activeOrganizationId && clientId);
  const listQuery = useContentList('agency', clientId, statusFilter);
  const createMutation = useCreateContent('agency', clientId);
  const createFromRequestMutation = useCreateContentFromRequest(clientId);

  const activeMembership = membershipsQuery.data?.memberships.find(
    (membership) => membership.organization.id === activeOrganizationId,
  );
  const canManage =
    activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN';

  // A 404 from the client-scoped list means the client is not selectable in
  // this organization (no ACTIVE ClientAgencyRelationship). Hide the section
  // tabs: without a valid client they are meaningless.
  const clientMissing =
    listQuery.isError &&
    listQuery.error instanceof ApiError &&
    listQuery.error.status === 404;

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
            : 'Select an organization first to manage client content.'}
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

  if (clientMissing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          Client not found in this organization.
        </div>
        <Link
          href="/clients"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to clients
        </Link>
      </div>
    );
  }

  const handleCreate = async (values: { title: string; body: string }) => {
    setServerError(null);
    try {
      // A submitted Content Request is associated with its first draft in the
      // same server transaction. Other intake sources keep the existing flow.
      const created =
        intake?.source === 'CLIENT_FORM'
          ? await createFromRequestMutation.mutateAsync({
              requestId: intake.id,
              body: values,
            })
          : await createMutation.mutateAsync(values);
      // Provenance (agency-only, insert-only): link the manual draft back to
      // its source intake without mutating RawData.
      if (intake) {
        try {
          await rawDataApi.recordDraftProvenance(
            clientId,
            created.id,
            intake.id,
          );
        } catch (noteError) {
          setServerError(
            describeApiError(
              noteError,
              'Draft created, but the provenance note could not be recorded.',
            ),
          );
        }
      }
      setShowCreate(false);
      setIntake(null);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to create the draft. Please try again.'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientContextHeader clientId={clientId} />
      <ClientSectionNav clientId={clientId} active="content" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
            Content
          </h3>
          <p className="text-sm text-slate-400">
            Drafts for this client. Submit for review, and let the client owner
            grant final confirmation. Publishing is not part of this phase.
          </p>
        </div>
        {canManage && !showCreate && (
          <Button type="button" onClick={() => setShowCreate(true)}>
            New draft
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(['ALL', ...CONTENT_STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60',
              statusFilter === value
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-slate-600 hover:text-slate-200',
            )}
          >
            {value === 'ALL'
              ? 'All'
              : CONTENT_STATUS_LABELS[value as ContentStatus]}
          </button>
        ))}
      </div>

      {showCreate && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {intake ? 'New draft from intake' : 'New draft'}
            </CardTitle>
            <CardDescription>
              {intake
                ? `Prefilled from intake ${intake.id.slice(0, 8)}… — review and edit before creating. Items always start as Draft.`
                : 'Items always start as Draft. The client owner approves the final text.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {intakeLoading ? (
              <p className="text-sm text-slate-400">Loading intake record…</p>
            ) : intakeError && !intake ? (
              <div
                role="alert"
                className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
              >
                {intakeError}
              </div>
            ) : (
              <ContentForm
                key={intake ? intake.id : 'blank'}
                mode="create"
                initialDraft={
                  prefill
                    ? { title: prefill.title, body: prefill.body }
                    : undefined
                }
                onSubmit={handleCreate}
                onCancel={() => {
                  setShowCreate(false);
                  setServerError(null);
                  setIntake(null);
                  setIntakeError(null);
                }}
                isSubmitting={
                  createMutation.isPending ||
                  createFromRequestMutation.isPending
                }
                error={serverError}
              />
            )}
          </CardContent>
        </Card>
      )}

      {listQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(
            listQuery.error,
            'Unable to load content for this client.',
          )}
        </div>
      ) : listQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading content…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentList
          items={listQuery.data}
          detailHref={(contentId) => `/clients/${clientId}/content/${contentId}`}
          emptyDescription={
            canManage
              ? 'Create the first draft for this client.'
              : 'No content has been created for this client yet.'
          }
        />
      )}
    </div>
  );
}