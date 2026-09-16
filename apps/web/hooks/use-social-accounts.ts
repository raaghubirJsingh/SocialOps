'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { queryKeys } from '@/lib/query-keys';
import { socialAccountApi } from '@/lib/social-account-api';
import type {
  CreateSocialAccountRequest,
  SocialAccountDto,
  UpdateSocialAccountRequest,
} from '@/types/social-account';

export type SocialAccountScope = 'agency' | 'mine';

/**
 * TanStack Query hooks for Social Accounts (Client Operations V1).
 *
 * Conventions follow the existing pages:
 *   - the ACTIVE organization id is part of every agency-side query key, and
 *     agency queries are DISABLED without one, so a request is never sent
 *     without the verified `X-Organization-Id` context;
 *   - `retry: 0` so a 401/403/404 surfaces immediately instead of being
 *     retried (auth recovery is owned by apiFetch);
 *   - mutations NEVER apply optimistically: the metadata is server-owned, so
 *     they invalidate on settle and let the server response define the truth.
 */
export function useSocialAccounts(scope: SocialAccountScope, clientId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();

  const enabled =
    !isLoading &&
    isAuthenticated &&
    Boolean(clientId) &&
    (scope === 'agency' ? Boolean(activeOrganizationId) : true);

  return useQuery<SocialAccountDto[]>({
    queryKey: queryKeys.socialAccounts(scope, activeOrganizationId, clientId),
    queryFn: () =>
      scope === 'agency'
        ? socialAccountApi.listForClient(clientId)
        : socialAccountApi.listMine(clientId),
    enabled,
    retry: 0,
  });
}

export function useCreateSocialAccount(
  scope: SocialAccountScope,
  clientId: string,
) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<
    SocialAccountDto,
    Error,
    CreateSocialAccountRequest
  >({
    mutationFn: (body) =>
      scope === 'agency'
        ? socialAccountApi.createForClient(clientId, body)
        : socialAccountApi.createMine(clientId, body),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.socialAccounts(scope, activeOrganizationId, clientId),
      }),
  });
}

export function useUpdateSocialAccount(
  scope: SocialAccountScope,
  clientId: string,
) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<
    SocialAccountDto,
    Error,
    { socialAccountId: string; body: UpdateSocialAccountRequest }
  >({
    mutationFn: ({ socialAccountId, body }) =>
      scope === 'agency'
        ? socialAccountApi.updateForClient(clientId, socialAccountId, body)
        : socialAccountApi.updateMine(clientId, socialAccountId, body),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.socialAccounts(scope, activeOrganizationId, clientId),
      }),
  });
}