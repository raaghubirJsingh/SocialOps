'use client';

import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { describeApiError } from '@/lib/api-error-messages';
import { clientApi } from '@/lib/client-api';
import type {
  AgencyRelationshipDto,
  AgencyRelationshipMutationResponse,
  DiscoverableAgencyDto,
  ManagementRequestDto,
} from '@/types/client';

export const clientAgencyRelationshipQueryKeys = {
  relationships: (clientId: string) =>
    ['client-agency-relationships', clientId] as const,
  invitations: (clientId: string) =>
    ['client-management-requests', clientId] as const,
  agencies: (clientId: string) => ['client-discoverable-agencies', clientId] as const,
};

type RelationshipAction =
  | { type: 'request'; organizationId: string }
  | { type: 'accept-invitation'; relationshipId: string }
  | { type: 'reject-invitation'; relationshipId: string }
  | { type: 'cancel-request'; relationshipId: string }
  | { type: 'terminate' };

type RelationshipActionResult =
  | AgencyRelationshipMutationResponse
  | Awaited<ReturnType<typeof clientApi.acceptManagementRequest>>;

/** Dispatch only the Client-side transition allowed for each UI action. */
export function executeClientRelationshipAction(
  clientId: string,
  action: RelationshipAction,
): Promise<RelationshipActionResult> {
  switch (action.type) {
    case 'request':
      return clientApi.createAgencyRequest(clientId, action.organizationId);
    case 'accept-invitation':
      return clientApi.acceptManagementRequest(clientId, action.relationshipId);
    case 'reject-invitation':
      return clientApi.rejectManagementRequest(clientId, action.relationshipId);
    case 'cancel-request':
      return clientApi.cancelAgencyRequest(clientId, action.relationshipId);
    case 'terminate':
      return clientApi.terminateAgencyRelationship(clientId);
  }
}

export async function refreshClientRelationshipQueries(
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => Promise<unknown>,
  clientId: string,
): Promise<void> {
  await Promise.all([
    invalidateQueries({
      queryKey: clientAgencyRelationshipQueryKeys.relationships(clientId),
    }),
    invalidateQueries({
      queryKey: clientAgencyRelationshipQueryKeys.invitations(clientId),
    }),
    invalidateQueries({
      queryKey: clientAgencyRelationshipQueryKeys.agencies(clientId),
    }),
  ]);
}

interface ClientAgencyRelationshipsPanelProps {
  clientId: string;
  onboardingPending?: boolean;
}

function RelationshipStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function agencyName(
  organizationId: string,
  relationships: AgencyRelationshipDto[],
  invitations: ManagementRequestDto[],
  agencies: DiscoverableAgencyDto[],
): string {
  return (
    relationships.find((relationship) => relationship.organizationId === organizationId)
      ?.organization.name ??
    invitations.find((invitation) => invitation.organizationId === organizationId)
      ?.organization.name ??
    agencies.find((agency) => agency.id === organizationId)?.name ??
    'Agency'
  );
}

export function ClientAgencyRelationshipsPanel({
  clientId,
  onboardingPending = false,
}: ClientAgencyRelationshipsPanelProps) {
  const queryClient = useQueryClient();
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const relationshipsQuery = useQuery<AgencyRelationshipDto[]>({
    queryKey: clientAgencyRelationshipQueryKeys.relationships(clientId),
    queryFn: () => clientApi.getMyAgencyRelationships(clientId),
    enabled: Boolean(clientId) && !onboardingPending,
    retry: 0,
  });
  const invitationsQuery = useQuery<ManagementRequestDto[]>({
    queryKey: clientAgencyRelationshipQueryKeys.invitations(clientId),
    queryFn: () => clientApi.getMyManagementRequests(clientId),
    enabled: Boolean(clientId) && !onboardingPending,
    retry: 0,
  });
  const agenciesQuery = useQuery<DiscoverableAgencyDto[]>({
    queryKey: clientAgencyRelationshipQueryKeys.agencies(clientId),
    queryFn: () => clientApi.discoverAgencies(clientId),
    enabled: Boolean(clientId) && !onboardingPending,
    retry: 0,
  });

  const actionMutation = useMutation<
    RelationshipActionResult,
    Error,
    RelationshipAction
  >({
    mutationFn: (action) =>
      executeClientRelationshipAction(clientId, action),
    onSuccess: async (_result, action) => {
      const messages: Record<RelationshipAction['type'], string> = {
        request: 'Agency relationship request sent.',
        'accept-invitation': 'Agency invitation accepted.',
        'reject-invitation': 'Agency invitation rejected.',
        'cancel-request': 'Agency request cancelled.',
        terminate: 'Agency relationship terminated.',
      };
      setSuccessMessage(messages[action.type]);
      setTerminationOpen(false);
      await refreshClientRelationshipQueries(
        (options) => queryClient.invalidateQueries(options),
        clientId,
      );
    },
  });

  const relationships = relationshipsQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const agencies = agenciesQuery.data ?? [];
  const activeRelationship =
    relationships.find((relationship) => relationship.status === 'ACTIVE') ?? null;
  const outgoingRequests = relationships.filter(
    (relationship) => relationship.status === 'PENDING_REQUEST',
  );
  const relationshipHistory = relationships.filter(
    (relationship) => relationship.status === 'TERMINATED',
  );
  const queryError = [
    relationshipsQuery,
    invitationsQuery,
    agenciesQuery,
  ].find((query) => query.isError)?.error;
  const isLoading =
    relationshipsQuery.isLoading ||
    invitationsQuery.isLoading ||
    agenciesQuery.isLoading;
  const actionPending = actionMutation.isPending;
  const canAct = Boolean(clientId) && !onboardingPending && !actionPending;

  return (
    <section
      aria-labelledby="agency-relationships-title"
      className="surface-panel rounded-lg p-6"
    >
      <h2
        id="agency-relationships-title"
        className="text-xl font-semibold tracking-tight text-slate-100"
      >
        Agency relationships
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Review your current Agency, invitations, requests, and available Agencies.
      </p>

      {onboardingPending ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300"
        >
          Complete Client onboarding before managing Agency relationships.
        </div>
      ) : !clientId ? (
        <div role="alert" className="mt-4 text-sm text-red-300">
          Client context is missing. Reopen your Client workspace and try again.
        </div>
      ) : (
        <>
          {isLoading ? (
            <div role="status" className="mt-4 text-sm text-slate-400">
              Loading Agency relationships…
            </div>
          ) : null}

          {queryError ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300"
            >
              {describeApiError(
                queryError,
                'Could not load Agency relationship information.',
              )}
            </div>
          ) : null}

          {actionMutation.isError ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300"
            >
              {describeApiError(
                actionMutation.error,
                'The Agency relationship action failed. Please try again.',
              )}
            </div>
          ) : null}

          {successMessage ? (
            <div
              role="status"
              className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300"
            >
              {successMessage}
            </div>
          ) : null}

          {!isLoading && !queryError && !activeRelationship &&
          invitations.length === 0 &&
          outgoingRequests.length === 0 &&
          relationshipHistory.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              You do not have an Agency relationship or pending request yet.
            </p>
          ) : null}

          {activeRelationship ? (
            <div className="mt-5 rounded-lg border border-blue-900/50 bg-blue-950/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-100">Current Agency</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {activeRelationship.organization.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <RelationshipStatus status="ACTIVE" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!canAct}
                    onClick={() => {
                      setSuccessMessage(null);
                      setTerminationOpen(true);
                    }}
                  >
                    Terminate relationship
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {invitations.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-medium text-slate-100">Incoming invitations</h3>
              <ul className="mt-3 space-y-3">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-4"
                  >
                    <div>
                      <p className="text-sm text-slate-100">
                        {invitation.organization.name}
                      </p>
                      <RelationshipStatus status="PENDING_INVITATION" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canAct || Boolean(activeRelationship)}
                        onClick={() => {
                          setSuccessMessage(null);
                          actionMutation.mutate({
                            type: 'accept-invitation',
                            relationshipId: invitation.id,
                          });
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!canAct}
                        onClick={() => {
                          setSuccessMessage(null);
                          actionMutation.mutate({
                            type: 'reject-invitation',
                            relationshipId: invitation.id,
                          });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {activeRelationship ? (
                <p className="mt-2 text-xs text-slate-400">
                  Terminate your current relationship before accepting another Agency.
                </p>
              ) : null}
            </div>
          ) : null}

          {outgoingRequests.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-medium text-slate-100">Outgoing requests</h3>
              <ul className="mt-3 space-y-3">
                {outgoingRequests.map((relationship) => (
                  <li
                    key={relationship.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-4"
                  >
                    <div>
                      <p className="text-sm text-slate-100">
                        {relationship.organization.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        The Agency must respond to this request.
                      </p>
                      <RelationshipStatus status="PENDING_REQUEST" />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canAct}
                      onClick={() => {
                        setSuccessMessage(null);
                        actionMutation.mutate({
                          type: 'cancel-request',
                          relationshipId: relationship.id,
                        });
                      }}
                    >
                      Cancel request
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {relationshipHistory.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-medium text-slate-100">Relationship history</h3>
              <ul className="mt-3 space-y-2">
                {relationshipHistory.map((relationship) => (
                  <li
                    key={relationship.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-4 py-3"
                  >
                    <span className="text-sm text-slate-300">
                      {relationship.organization.name}
                    </span>
                    <RelationshipStatus status={relationship.status} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!queryError ? (
            <div className="mt-6">
              <h3 className="font-medium text-slate-100">Discover Agencies</h3>
              {agencies.length === 0 && !agenciesQuery.isLoading ? (
                <p className="mt-2 text-sm text-slate-400">
                  No Agencies are currently available to request.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {agencies.map((agency) => {
                    const hasPendingRelationship = relationships.some(
                      (relationship) =>
                        relationship.organizationId === agency.id &&
                        (relationship.status === 'PENDING_REQUEST' ||
                          relationship.status === 'PENDING_INVITATION'),
                    );
                    const hasInvitation = invitations.some(
                      (invitation) => invitation.organizationId === agency.id,
                    );
                    return (
                      <li
                        key={agency.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-4"
                      >
                        <span className="text-sm text-slate-100">{agency.name}</span>
                        {hasPendingRelationship ? (
                          <span className="text-xs text-slate-400">
                            {hasInvitation
                              ? 'Invitation pending'
                              : 'Request pending'}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canAct || Boolean(activeRelationship)}
                            onClick={() => {
                              setSuccessMessage(null);
                              actionMutation.mutate({
                                type: 'request',
                                organizationId: agency.id,
                              });
                            }}
                          >
                            Request relationship
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {activeRelationship ? (
                <p className="mt-2 text-xs text-slate-400">
                  Terminate your current relationship before requesting another Agency.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={terminationOpen}
        title="Terminate Agency relationship?"
        description={
          activeRelationship
            ? `This will end your active relationship with ${agencyName(
                activeRelationship.organizationId,
                relationships,
                invitations,
                agencies,
              )}. You must terminate it before requesting another Agency.`
            : 'This will end your active Agency relationship.'
        }
        onClose={() => setTerminationOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={actionPending}
              onClick={() => setTerminationOpen(false)}
            >
              Keep relationship
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canAct}
              onClick={() => {
                setSuccessMessage(null);
                actionMutation.mutate({ type: 'terminate' });
              }}
            >
              {actionPending ? 'Terminating…' : 'Confirm termination'}
            </Button>
          </>
        }
      />
    </section>
  );
}
