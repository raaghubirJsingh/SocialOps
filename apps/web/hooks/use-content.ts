'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { contentApi } from '@/lib/content-api';
import { queryKeys } from '@/lib/query-keys';
import type {
  ContentDto,
  ContentRevisionDto,
  ContentStatus,
  ContentStatusEventDto,
  CreateContentRequest,
  TransitionContentRequest,
  UpdateContentRequest,
} from '@/types/content';

export type ContentScope = 'agency' | 'mine';

/**
 * TanStack Query hooks for Content (Client Operations V1).
 *
 * Rules applied consistently with the social-account hooks:
 *   - agency queries require an ACTIVE organization (the verified
 *     `X-Organization-Id` is attached by apiFetch), and the organization id is
 *     part of every agency query key;
 *   - `retry: 0`, so a 403/404/409 surfaces immediately;
 *   - NO optimistic updates: `status` and the confirmation triple are
 *     server-owned, so mutations invalidate on settle and the server response
 *     is the only truth. A stale client-side mirror can therefore never leave
 *     the UI claiming a transition the server refused.
 */
function useContentQueryEnabled(
  scope: ContentScope,
  clientId: string,
): boolean {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();
  return (
    !isLoading &&
    isAuthenticated &&
    Boolean(clientId) &&
    (scope === 'agency' ? Boolean(activeOrganizationId) : true)
  );
}

/** Invalidates every content cache entry for one item (and its lists). */
function invalidateContent(
  queryClient: QueryClient,
  scope: ContentScope,
  organizationId: string | null,
  clientId: string,
  contentId?: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: ['content', 'list', scope, organizationId, clientId],
  });
  if (contentId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.contentDetail(
        scope,
        organizationId,
        clientId,
        contentId,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.contentRevisions(scope, clientId, contentId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.contentStatusEvents(scope, clientId, contentId),
    });
  }
}

export function useContentList(
  scope: ContentScope,
  clientId: string,
  status: ContentStatus | 'ALL' = 'ALL',
) {
  const { activeOrganizationId } = useActiveOrganization();
  const enabled = useContentQueryEnabled(scope, clientId);

  return useQuery<ContentDto[]>({
    queryKey: queryKeys.contentList(
      scope,
      activeOrganizationId,
      clientId,
      status,
    ),
    queryFn: () =>
      scope === 'agency'
        ? contentApi.listForClient(
            clientId,
            status === 'ALL' ? undefined : status,
          )
        : contentApi.listMine(clientId, status === 'ALL' ? undefined : status),
    enabled,
    retry: 0,
  });
}

export function useContentDetail(
  scope: ContentScope,
  clientId: string,
  contentId: string,
) {
  const { activeOrganizationId } = useActiveOrganization();
  const enabled = useContentQueryEnabled(scope, clientId) && Boolean(contentId);

  return useQuery<ContentDto>({
    queryKey: queryKeys.contentDetail(
      scope,
      activeOrganizationId,
      clientId,
      contentId,
    ),
    queryFn: () =>
      scope === 'agency'
        ? contentApi.getForClient(clientId, contentId)
        : contentApi.getMine(clientId, contentId),
    enabled,
    retry: 0,
  });
}

/** Insert-only revision history (immutable snapshots, newest first). */
export function useContentRevisions(
  scope: ContentScope,
  clientId: string,
  contentId: string,
) {
  const enabled = useContentQueryEnabled(scope, clientId) && Boolean(contentId);

  return useQuery<ContentRevisionDto[]>({
    queryKey: queryKeys.contentRevisions(scope, clientId, contentId),
    queryFn: () =>
      scope === 'agency'
        ? contentApi.revisionsForClient(clientId, contentId)
        : contentApi.revisionsMine(clientId, contentId),
    enabled,
    retry: 0,
  });
}

/** Append-only status-transition audit trail (newest first). */
export function useContentStatusEvents(
  scope: ContentScope,
  clientId: string,
  contentId: string,
) {
  const enabled = useContentQueryEnabled(scope, clientId) && Boolean(contentId);

  return useQuery<ContentStatusEventDto[]>({
    queryKey: queryKeys.contentStatusEvents(scope, clientId, contentId),
    queryFn: () =>
      scope === 'agency'
        ? contentApi.statusEventsForClient(clientId, contentId)
        : contentApi.statusEventsMine(clientId, contentId),
    enabled,
    retry: 0,
  });
}

export function useCreateContent(scope: ContentScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<ContentDto, Error, CreateContentRequest>({
    mutationFn: (body) =>
      scope === 'agency'
        ? contentApi.createForClient(clientId, body)
        : contentApi.createMine(clientId, body),
    onSettled: () =>
      invalidateContent(queryClient, scope, activeOrganizationId, clientId),
  });
}

export function useUpdateContent(scope: ContentScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<
    ContentDto,
    Error,
    { contentId: string; body: UpdateContentRequest }
  >({
    mutationFn: ({ contentId, body }) =>
      scope === 'agency'
        ? contentApi.updateForClient(clientId, contentId, body)
        : contentApi.updateMine(clientId, contentId, body),
    onSettled: (_data, _error, variables) =>
      invalidateContent(
        queryClient,
        scope,
        activeOrganizationId,
        clientId,
        variables.contentId,
      ),
  });
}

export function useTransitionContent(scope: ContentScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<
    ContentDto,
    Error,
    { contentId: string; body: TransitionContentRequest }
  >({
    mutationFn: ({ contentId, body }) =>
      scope === 'agency'
        ? contentApi.transitionForClient(clientId, contentId, body)
        : contentApi.transitionMine(clientId, contentId, body),
    onSettled: (_data, _error, variables) =>
      invalidateContent(
        queryClient,
        scope,
        activeOrganizationId,
        clientId,
        variables.contentId,
      ),
  });
}