'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { clientApi } from '@/lib/client-api';
import type { ClientDto } from '@/types/client';

/**
 * Agency-side client context header (display-only).
 *
 * Shows which client the current agency sub-page belongs to: Back link,
 * client name, and type/status line. Reuses the SAME query key as the
 * Overview page (`['client', orgId, clientId]`) so TanStack Query shares
 * the cached `GET /api/clients/:id` response instead of refetching.
 *
 * DISPLAY ONLY (AGENTS.md §7): this header never authorizes anything. The
 * `clientId` comes from the route, and the backend re-proves the ACTIVE
 * ClientAgencyRelationship on every request. Loading shows a placeholder;
 * errors render nothing here so the page-level guard stays the single
 * error surface (no duplicate messages).
 */
export function ClientContextHeader({ clientId }: { clientId: string }) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const clientQuery = useQuery<ClientDto>({
    queryKey: ['client', activeOrganizationId, clientId],
    queryFn: () => clientApi.getClient(clientId),
    enabled: Boolean(activeOrganizationId && clientId) && !sessionLoading && isAuthenticated,
    retry: 0,
  });

  if (clientQuery.isPending) {
    return (
      <header className="space-y-1">
        <Link
          href="/clients"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to clients
        </Link>
        <p className="text-sm text-slate-400" aria-live="polite">
          Loading client…
        </p>
      </header>
    );
  }

  if (clientQuery.isError || !clientQuery.data) {
    return null;
  }

  const client = clientQuery.data;

  return (
    <header className="space-y-1">
      <Link
        href="/clients"
        className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        ← Back to clients
      </Link>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{client.name}</h2>
      <p className="text-sm text-slate-400">
        {client.type === 'BUSINESS' ? 'Business' : 'Individual'} client · Status:{' '}
        <span className="font-medium">{client.status}</span>
      </p>
    </header>
  );
}
