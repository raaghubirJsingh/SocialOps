'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { queryKeys } from '@/lib/query-keys';
import { rawDataApi } from '@/lib/raw-data-api';
import type { CreateRawDataRequest, RawDataDto } from '@/types/content';

export type RawDataScope = 'agency' | 'mine';

/**
 * TanStack Query hooks for RawData intake (Client Operations V1).
 *
 * INSERT-ONLY by construction: there is no update or delete hook here (and no
 * such backend route), so the UI cannot offer one. `contentHash` is computed by
 * the server from the payload it receives, and `storageRef` is never sent
 * because S3-compatible storage is deferred - V1 intake is pasted text and/or
 * structured metadata only, with NO file upload.
 */
export function useRawData(scope: RawDataScope, clientId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();

  const enabled =
    !isLoading &&
    isAuthenticated &&
    Boolean(clientId) &&
    (scope === 'agency' ? Boolean(activeOrganizationId) : true);

  return useQuery<RawDataDto[]>({
    queryKey: queryKeys.rawData(scope, activeOrganizationId, clientId),
    queryFn: () =>
      scope === 'agency'
        ? rawDataApi.listForClient(clientId)
        : rawDataApi.listMine(clientId),
    enabled,
    retry: 0,
  });
}

export function useCreateRawData(scope: RawDataScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<RawDataDto, Error, CreateRawDataRequest>({
    mutationFn: (body) =>
      scope === 'agency'
        ? rawDataApi.createForClient(clientId, body)
        : rawDataApi.createMine(clientId, body),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.rawData(scope, activeOrganizationId, clientId),
      }),
  });
}