'use client';

import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/client-api';
import { useSession } from './use-session';
import type { ClientDto } from '@/types/client';

/**
 * Fetch the current client profile.
 * Requires authentication and a valid clientId.
 */
export function useClient(clientId: string | null) {
  const { isAuthenticated } = useSession();

  return useQuery<ClientDto>({
    queryKey: ['client', clientId],
    queryFn: () => clientApi.getMyClient(clientId!),
    enabled: isAuthenticated && !!clientId,
    retry: 0,
  });
}
