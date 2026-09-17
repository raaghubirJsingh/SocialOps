'use client';

import { useQuery } from '@tanstack/react-query';

import { useActiveOrganization } from './use-active-organization';
import { useSession } from './use-session';
import { apiFetch } from '@/lib/api';
import type { AiEmployeeDto } from '@/types/organizations';

/**
 * Fetch the AI employees (Users with `isBot = true`) that are members of the
 * ACTIVE organization via `GET /api/organizations/ai-members`. The verified
 * `X-Organization-Id` is attached by apiFetch and re-verified server-side by
 * the global OrganizationMembershipGuard (AGENTS.md §6-§7).
 *
 * The active organization id is part of the query key, so switching tenants
 * can never surface a stale cross-tenant bot list.
 */
export function useAiEmployees() {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();

  const enabled = !isLoading && isAuthenticated && Boolean(activeOrganizationId);

  return useQuery<AiEmployeeDto[]>({
    queryKey: ['organizations', 'ai-members', activeOrganizationId],
    queryFn: () => apiFetch<AiEmployeeDto[]>('/organizations/ai-members'),
    enabled,
    retry: 0,
  });
}
