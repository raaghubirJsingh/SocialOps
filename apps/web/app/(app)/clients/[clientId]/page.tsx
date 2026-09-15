'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import type { ClientDto, ClientEventDto } from '@/types/client';

/**
 * Agency-facing Client detail (GET /api/clients/:id) and audit history
 * (GET /api/clients/:id/history) — Client Module V1, read-only drill-down.
 *
 * Tenant isolation contract:
 *   - `clientId` comes from the route, but the backend scopes every lookup
 *     to the ACTIVE organization (verified `X-Organization-Id` header +
 *     ACTIVE ClientAgencyRelationship). Anything outside that scope answers
 *     a uniform 404 with no cross-agency existence leak. The organization
 *     id is NEVER taken from user-editable input.
 *   - No request is issued without an active organization (`enabled`
 *     guards on both queries).
 *   - 401s self-heal via the apiFetch single-flight refresh; 403s matching
 *     the backend contract clear the stale org context globally.
 */
function describeDetailError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'Client not found in this organization.';
    }
    if (err.status === 403) {
      return 'Your account is not a member of this organization, or the organization is unavailable.';
    }
    if (err.status === 400) {
      return 'The organization context was missing or malformed. Pick an organization again.';
    }
    return err.message;
  }
  return 'Unable to load the client. Please try again.';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  // Both queries stay disabled until the org context exists.
  const orgReady = Boolean(activeOrganizationId && clientId);

  const clientQuery = useQuery<ClientDto>({
    queryKey: ['client', activeOrganizationId, clientId],
    queryFn: () => clientApi.getClient(clientId),
    enabled: orgReady,
    retry: 0,
  });

  const historyQuery = useQuery<ClientEventDto[]>({
    queryKey: ['client-history', activeOrganizationId, clientId],
    queryFn: () => clientApi.getClientHistory(clientId),
    enabled: orgReady,
    retry: 0,
  });

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!orgReady) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          Select an organization first to view client details.
        </p>
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  if (clientQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeDetailError(clientQuery.error)}
        </div>
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
          ← Back to clients
        </Link>
      </div>
    );
  }

  const client = clientQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
          ← Back to clients
        </Link>
        <h2 className="text-2xl font-semibold text-slate-100">{client?.name}</h2>
        <p className="text-sm text-slate-400">
          {client?.type === 'BUSINESS' ? 'Business' : 'Individual'} client · created{' '}
          {client ? new Date(client.createdAt).toLocaleDateString() : ''}
        </p>
      </header>

      {clientQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading client…</p>
          </CardContent>
        </Card>
      ) : client ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Client identity and contact details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-300">
                Type: {client.type === 'BUSINESS' ? 'Business' : 'Individual'}
              </p>
              <p className="text-slate-300">Status: {client.status}</p>
              <p className="text-slate-300">Onboarding: {client.onboardingStatus}</p>
              <p className="text-slate-300">Direct email: {client.directEmail}</p>
              <p className="text-slate-300">Direct phone: {client.directPhone}</p>
              {client.website && <p className="text-slate-300">Website: {client.website}</p>}
              {client.industry && <p className="text-slate-300">Industry: {client.industry}</p>}
              {client.description && <p className="text-slate-400">{client.description}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational state</CardTitle>
              <CardDescription>Lifecycle and ownership state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-300">
                Owner account:{' '}
                {client.ownerUserId ? 'Bound' : 'Unbound (pending invitation)'}
              </p>
              {client.statusReason && (
                <p className="text-slate-400">Status reason: {client.statusReason}</p>
              )}
              <p className="text-slate-400">
                Last updated: {formatDateTime(client.updatedAt)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            Audit events recorded since this organization&apos;s relationship
            with the client began (server-capped at 200, newest first).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {historyQuery.isError ? (
            <p role="alert" className="text-sm text-red-300">
              Unable to load activity history.
            </p>
          ) : historyQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading activity…</p>
          ) : historyQuery.data.length === 0 ? (
            <p className="text-sm text-slate-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {historyQuery.data.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
                >
                  <p className="font-medium text-slate-200">{event.action}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

