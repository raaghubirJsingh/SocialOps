'use client';

import { useQuery } from '@tanstack/react-query';

import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import type { ClientDto, ClientEventDto } from '@/types/client';

/**
 * TanStack Query hooks for the client persona overview + notifications.
 *
 * Conventions match the existing hooks (`retry: 0` — auth recovery is owned
 * by apiFetch). Every call sends the persisted, server-verified binding id
 * as the `X-Client-Id` hint; ClientAccessGuard re-verifies the binding
 * server-side on every request, so these hooks are never an authorization
 * source (AGENTS.md §7).
 */
export function useMyClient(clientId: string) {
  const { isAuthenticated, isLoading } = useSession();

  return useQuery<ClientDto>({
    queryKey: ['client', 'me', clientId],
    queryFn: () => clientApi.getMyClient(clientId),
    enabled: !isLoading && isAuthenticated && Boolean(clientId),
    retry: 0,
  });
}

export function useMyHistory(clientId: string) {
  const { isAuthenticated, isLoading } = useSession();

  return useQuery<ClientEventDto[]>({
    queryKey: ['client-history', 'mine', clientId],
    queryFn: () => clientApi.getMyHistory(clientId),
    enabled: !isLoading && isAuthenticated && Boolean(clientId),
    retry: 0,
  });
}