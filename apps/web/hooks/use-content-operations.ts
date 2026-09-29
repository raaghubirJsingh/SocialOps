/**
 * Phase 4 (Integration) — Content operations hooks for the Phase 3 UI.
 *
 * Wires the Phase 3 preview components (ManagerWorkspace, ClientReviewPortal)
 * to the REAL Phase 2 NestJS scoped routes — NOT generic `/content/:id`
 * literals (no such route exists):
 *   - agency scope: `/clients/:clientId/content/:contentId/...` (org context
 *     via the verified X-Organization-Id header attached by apiFetch);
 *   - client scope: `/client/me/content/:contentId/...` (X-Client-Id hint,
 *     re-verified server-side by ClientAccessGuard on every request).
 *
 * Conventions match use-content.ts:
 *   - `retry: 0` (auth recovery is owned by apiFetch);
 *   - no optimistic updates (status / locks / counters are server-owned, so
 *     mutations invalidate on settle and the server response is the truth);
 *   - boundary preserved: agency-only data (internal notes) is fetched only
 *     by agency hooks and never by client hooks (AGENTS.md §7);
 *   - every AGENCY query key carries `activeOrganizationId`, per the
 *     organization-scoped convention in `lib/query-keys.ts` and use-content.ts.
 *     Without it, a session that switches organizations would read the previous
 *     tenant's cached row before any refetch resolves. Mutation invalidations
 *     MUST use the identical key or `invalidateQueries` prefix-matches nothing.
 *     Client-scope keys are deliberately NOT organization-scoped: a Client owner
 *     is not an Organization member, so the tenant key is the bound clientId.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { contentApi } from '@/lib/content-api';
import { queryKeys } from '@/lib/query-keys';
import type {
  ChangeRequestDto,
  ConfirmFinalRequest,
  ContentDto,
  ContentRevisionDto,
  CreateChangeRequestRequest,
  InternalNoteDto,
  ProcessAiTaskRequest,
} from '@/types/content';

export const CONTENT_SCENARIO_1_CHANGE_REQUEST_LIMIT = 2;

/**
 * Shared enabled-gate WITHOUT conditional hooks: callers compute the booleans
 * first and pass the result in. Hooks must never call useActiveOrganization /
 * useSession conditionally, so this helper takes plain values.
 */
function opsEnabled(
  isLoading: boolean,
  isAuthenticated: boolean,
  activeOrganizationId: string | null,
  requiresOrg: boolean,
  clientId: string,
  contentId: string,
): boolean {
  return (
    !isLoading &&
    isAuthenticated &&
    Boolean(clientId) &&
    Boolean(contentId) &&
    (requiresOrg ? Boolean(activeOrganizationId) : true)
  );
}

export function useAgencyContent(clientId: string, contentId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  const enabled = opsEnabled(isLoading, isAuthenticated, activeOrganizationId, true, clientId, contentId);
  return useQuery<ContentDto>({
    // The shared factory already carries the active organization id, so this key
    // is the SAME entry use-content.ts writes for the production detail page and
    // switching organizations can never surface the previous tenant's row.
    queryKey: queryKeys.contentDetail('agency', activeOrganizationId, clientId, contentId),
    queryFn: () => contentApi.getForClient(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useAgencyInternalNotes(clientId: string, contentId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  const enabled = opsEnabled(isLoading, isAuthenticated, activeOrganizationId, true, clientId, contentId);
  return useQuery<InternalNoteDto[]>({
    // Agency-only data: the organization id is part of the key so a session that
    // switches organizations never reads another tenant's notes from cache.
    queryKey: ['content', 'internal-notes', 'agency', activeOrganizationId, clientId, contentId],
    queryFn: () => contentApi.internalNotesForClient(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useAgencyRevisions(clientId: string, contentId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  const enabled = opsEnabled(isLoading, isAuthenticated, activeOrganizationId, true, clientId, contentId);
  return useQuery<ContentRevisionDto[]>({
    // Scoped inline rather than via queryKeys.contentRevisions: that factory takes
    // no organizationId (query-keys.ts:30-34), so using it here would leave this
    // agency revision cache shared across organizations. The key SHAPE matches
    // the factory's ordering so the two stay recognisable.
    queryKey: ['content', 'revisions', 'agency', activeOrganizationId, clientId, contentId],
    queryFn: () => contentApi.revisionsForClient(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useProcessAiTask(clientId: string, contentId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();
  return useMutation<ContentRevisionDto | InternalNoteDto, Error, ProcessAiTaskRequest>({
    mutationFn: (body) => contentApi.processAiTaskForClient(clientId, contentId, body),
    onSettled: () => {
      // These MUST stay identical to the query keys above, otherwise
      // invalidateQueries prefix-matches nothing and the UI serves stale data.
      void queryClient.invalidateQueries({ queryKey: queryKeys.contentDetail('agency', activeOrganizationId, clientId, contentId) });
      void queryClient.invalidateQueries({ queryKey: ['content', 'revisions', 'agency', activeOrganizationId, clientId, contentId] });
      void queryClient.invalidateQueries({ queryKey: ['content', 'internal-notes', 'agency', activeOrganizationId, clientId, contentId] });
    },
  });
}

export function useTransitionAgencyContent(clientId: string, contentId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();
  return useMutation<ContentDto, Error, { to: 'UNDER_CLIENT_REVIEW'; note?: string }>({
    mutationFn: ({ to, note }) => contentApi.transitionForClient(clientId, contentId, { to, note }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.contentDetail('agency', activeOrganizationId, clientId, contentId) });
    },
  });
}

export function useClientContent(clientId: string, contentId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  const enabled = opsEnabled(isLoading, isAuthenticated, activeOrganizationId, false, clientId, contentId);
  return useQuery<ContentDto>({
    queryKey: ['content', 'detail', 'mine', clientId, contentId],
    queryFn: () => contentApi.getMine(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useClientChangeRequests(clientId: string, contentId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  const enabled = opsEnabled(isLoading, isAuthenticated, activeOrganizationId, false, clientId, contentId);
  return useQuery<ChangeRequestDto[]>({
    queryKey: ['content', 'change-requests', 'mine', clientId, contentId],
    queryFn: () => contentApi.changeRequestsMine(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useSubmitChangeRequest(clientId: string, contentId: string) {
  const queryClient = useQueryClient();
  return useMutation<ChangeRequestDto, Error, CreateChangeRequestRequest>({
    mutationFn: (body) => contentApi.createChangeRequestMine(clientId, contentId, body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['content', 'detail', 'mine', clientId, contentId] });
      void queryClient.invalidateQueries({ queryKey: ['content', 'change-requests', 'mine', clientId, contentId] });
    },
  });
}

export function useConfirmFinalLock(clientId: string, contentId: string) {
  const queryClient = useQueryClient();
  return useMutation<ContentDto, Error, ConfirmFinalRequest>({
    mutationFn: (body) => contentApi.confirmFinalLockMine(clientId, contentId, body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['content', 'detail', 'mine', clientId, contentId] });
      void queryClient.invalidateQueries({ queryKey: ['content', 'change-requests', 'mine', clientId, contentId] });
    },
  });
}

