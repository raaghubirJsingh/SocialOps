'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { ContentForm } from '@/components/content/content-form';
import { ContentRevisionList } from '@/components/content/content-revision-list';
import { ContentStatusActions } from '@/components/content/content-status-actions';
import { ContentStatusEventList } from '@/components/content/content-status-event-list';
import { ContentStatusTimeline } from '@/components/content/content-status-timeline';
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
  useContentDetail,
  useContentRevisions,
  useContentStatusEvents,
  useTransitionContent,
  useUpdateContent,
} from '@/hooks/use-content';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { isEditable } from '@/lib/content-status';
import type { ContentTransitionTarget } from '@/types/content';

/**
 * Agency-side Content detail (Client Operations V1).
 *
 * The agency acts as 'AGENCY_ADMIN': it may draft, edit, submit for review,
 * resubmit, and archive. It can NEVER request changes (client-owner-only review)
 * and there is NO final-confirmation control on this route at all - the
 * dedicated client endpoint is the only door to APPROVED, and the backend
 * rejects any other path regardless of what the UI renders.
 */
export default function AgencyContentDetailPage() {
  const { clientId, contentId } = useParams<{
    clientId: string;
    contentId: string;
  }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const detailQuery = useContentDetail('agency', clientId, contentId);
  const revisionsQuery = useContentRevisions('agency', clientId, contentId);
  const eventsQuery = useContentStatusEvents('agency', clientId, contentId);
  const updateMutation = useUpdateContent('agency', clientId);
  const transitionMutation = useTransitionContent('agency', clientId);

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

  const handleSave = async (values: { title: string; body: string }) => {
    setServerError(null);
    try {
      // Optimistic concurrency (D5): send the revision the editor loaded.
      const expectedRevision = revisionsQuery.data?.[0]?.revision;
      await updateMutation.mutateAsync({
        contentId,
        body: { ...values, ...(expectedRevision ? { expectedRevision } : {}) },
      });
      setIsEditing(false);
    } catch (error) {
      setServerError(
        describeApiError(error, 'Unable to save this content. Please try again.'),
      );
    }
  };

  const handleTransition = async (input: { to: string; note?: string }) => {
    setServerError(null);
    try {
      await transitionMutation.mutateAsync({
        contentId,
        body: { to: input.to as ContentTransitionTarget, note: input.note },
      });
    } catch (error) {
      setServerError(
        describeApiError(error, 'That status change was not accepted.'),
      );
    }
  };

  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ClientSectionNav clientId={clientId} active="content" />
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(
            detailQuery.error,
            'Unable to load this content item.',
          )}
        </div>
        <Link
          href={`/clients/${clientId}/content`}
          className="text-sm text-blue-400 hover:underline"
        >
          ← Back to content
        </Link>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <ClientSectionNav clientId={clientId} active="content" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading content…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = detailQuery.data;
  const editable = isEditable(content.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientSectionNav clientId={clientId} active="content" />

      <div className="space-y-1">
        <Link
          href={`/clients/${clientId}/content`}
          className="text-sm text-blue-400 hover:underline"
        >
          ← Back to content
        </Link>
        <h2 className="text-2xl font-semibold text-slate-100">{content.title}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
          <CardDescription>
            The client owner grants final confirmation; publishing is not part of
            this phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ContentStatusTimeline
            status={content.status}
            confirmedAt={content.finalConfirmedAt}
            confirmedRevisionId={content.finalConfirmedRevisionId}
          />

          {canManage ? (
            <ContentStatusActions
              content={content}
              actor="AGENCY_ADMIN"
              onTransition={handleTransition}
              isSubmitting={transitionMutation.isPending || updateMutation.isPending}
              error={serverError}
              disabled={isEditing}
            />
          ) : (
            <p className="text-sm text-slate-400">
              You can view this item, but only an OWNER or ADMIN can change it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Text</CardTitle>
            <CardDescription>
              {editable
                ? 'Drafts and items with requested changes can be edited.'
                : 'This item cannot be edited in its current status.'}
            </CardDescription>
          </div>
          {canManage && editable && !isEditing && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setServerError(null);
                setIsEditing(true);
              }}
            >
              Edit text
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditing && canManage ? (
            <ContentForm
              mode="edit"
              initial={content}
              onSubmit={handleSave}
              onCancel={() => {
                setIsEditing(false);
                setServerError(null);
              }}
              isSubmitting={updateMutation.isPending}
              error={serverError}
            />
          ) : (
            <div className="space-y-3">
              {serverError && (
                <div
                  role="alert"
                  className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
                >
                  {serverError}
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm text-slate-200">
                {content.body}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {revisionsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading revisions…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentRevisionList revisions={revisionsQuery.data ?? []} />
      )}

      {eventsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading status history…</p>
          </CardContent>
        </Card>
      ) : (
        <ContentStatusEventList events={eventsQuery.data ?? []} />
      )}
    </div>
  );
}