'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from './use-session';
import { apiFetch } from '@/lib/api';
import type { MembershipsResponseDto } from '@/types/organizations';

/**
 * Fetch the authenticated user's OrganizationMembership rows via the
 * existing `GET /api/memberships/me` endpoint. The route is public in
 * the sense that it does not require `X-Organization-Id` (the
 * OrganizationMembershipGuard is bypassed by `@Public()` on that route).
 * It does require a valid JWT.
 */
export function useMyMemberships() {
  const { isAuthenticated, session } = useSession();
  return useQuery<MembershipsResponseDto>({
    queryKey: ['memberships', 'me', session?.accessToken ? 'auth' : 'anon'],
    queryFn: () => apiFetch<MembershipsResponseDto>('/memberships/me'),
    enabled: isAuthenticated,
    retry: 0,
  });
}
