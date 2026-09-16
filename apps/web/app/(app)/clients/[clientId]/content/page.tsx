'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
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
import { useContentList, useCreateContent } from '@/hooks/use-content';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { cn } from '@/lib/cn';
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
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
  const { clientId } = useParams<{ clientId: string }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const orgReady = Boolean(activeOrganizationId && clientId);
  const listQuery = useContentList('agency', clientId, statusFilter);
  const createMutation = useCreateContent('agency', clientId);

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
          Select an organization first to manage client content.
        </p>
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  const handleCreate = async (values: { title: string; body: string }) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values);
      setShowCreate(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to create the draft. Please try again.'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientSectionNav clientId={clientId} active="content" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">Content</h2>
          <p className="text-sm text-slate-400">
            Draft the story here, submit it for review, and let the client owner
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
              'rounded-full border px-3 py-1 text-xs transition-colors',
              statusFilter === value
                ? 'border-blue-800 bg-blue-950/50 text-blue-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200',
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
            <CardTitle className="text-base">New draft</CardTitle>
            <CardDescription>
              Items always start as Draft. The client owner approves the final text.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContentForm
              mode="create"
              onSubmit={handleCreate}
              onCancel={() => {
                setShowCreate(false);
                setServerError(null);
              }}
              isSubmitting={createMutation.isPending}
              error={serverError}
            />
          </CardContent>
        </Card>
      )}

      {listQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
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