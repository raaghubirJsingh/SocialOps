'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { CreateClientForm } from '@/components/clients/create-client-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import type { ClientDto } from '@/types/client';

/**
 * Agency-facing Client list (GET /api/clients) and creation (POST
 * /api/clients) — Client Module V1, Agency-side operations.
 *
 * Tenant isolation contract:
 *   - The page NEVER issues a request without an active organization.
 *     apiFetch attaches the active organization as the verified
 *     `X-Organization-Id` header, and the backend's global
 *     OrganizationMembershipGuard re-validates the caller's membership
 *     (and Organization.isActive) server-side on every call. The
 *     organization id is NEVER taken from user-editable input.
 *   - The list contains ONLY Clients with an ACTIVE ClientAgencyRelationship
 *     to the active organization (backend `listClientsForOrganization`).
 *
 * The "New client" affordance is gated on the caller's organization role
 * (OWNER or ADMIN) as a UI convenience only; the backend RoleGuard +
 * @RequireMinimumRole('ADMIN') remain the authority.
 */

function describeClientsError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return 'Your account is not a member of this organization, or the organization is unavailable.';
    }
    if (err.status === 400) {
      return 'The organization context was missing or malformed. Pick an organization again.';
    }
    return err.message;
  }
  return 'Unable to load clients. Please try again.';
}

export default function AgencyClientsPage() {
  const { activeOrganizationId, setActiveOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const clientsQuery = useQuery<ClientDto[]>({
    queryKey: ['clients', activeOrganizationId],
    queryFn: () => clientApi.listClients(),
    // Never issue a request without an active organization: the backend
    // rejects every call without the X-Organization-Id header.
    enabled: Boolean(activeOrganizationId),
    retry: 0,
  });

  const activeMembership = membershipsQuery.data?.memberships.find(
    (membership) => membership.organization.id === activeOrganizationId,
  );
  // UI convenience only. The backend RoleGuard + RequireMinimumRole('ADMIN')
  // enforce OWNER/ADMIN authority on POST /api/clients regardless of this flag.
  const canManage =
    activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN';

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  // No active organization yet: prompt the user to pick one from their
  // memberships (GET /api/memberships/me). This is not a security check -
  // the backend independently verifies membership for every request.
  if (!activeOrganizationId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">Clients</h2>
          <p className="text-sm text-slate-400">
            Select the organization you want to manage clients for. Every API
            call is scoped server-side to this organization via the verified
            X-Organization-Id header.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Choose an organization</CardTitle>
            <CardDescription>
              {membershipsQuery.isPending
                ? 'Loading your organizations…'
                : 'Your active organization determines which clients you can see and manage.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {membershipsQuery.data?.memberships.map((membership) => (
              <button
                key={membership.organization.id}
                type="button"
                onClick={() => setActiveOrganizationId(membership.organization.id)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-left text-sm text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                <span className="font-medium">{membership.organization.name}</span>
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {membership.role}
                </span>
              </button>
            ))}
            {membershipsQuery.data && membershipsQuery.data.memberships.length === 0 && (
              <p className="text-sm text-slate-400">
                You are not a member of any organization yet.
              </p>
            )}
            {membershipsQuery.isError && (
              <p role="alert" className="text-sm text-red-300">
                Unable to load your organizations. Please refresh and try again.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreated = () => {
    setShowCreateForm(false);
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-100">Clients</h2>
          <p className="text-sm text-slate-400">
            {activeMembership
              ? `Managing clients as ${activeMembership.role} of ${activeMembership.organization.name}.`
              : 'Clients managed by your active organization.'}
          </p>
        </div>
        {canManage && !showCreateForm && (
          <Button type="button" onClick={() => setShowCreateForm(true)}>
            New client
          </Button>
        )}
      </header>

      {showCreateForm && canManage && (
        <CreateClientForm onCreated={handleCreated} onCancel={() => setShowCreateForm(false)} />
      )}

      {clientsQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeClientsError(clientsQuery.error)}
        </div>
      ) : clientsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading clients…</p>
          </CardContent>
        </Card>
      ) : clientsQuery.data.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No clients yet</CardTitle>
            <CardDescription>
              {canManage
                ? 'Create your first client to start managing their social media operations.'
                : 'This organization has not onboarded any clients yet.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clientsQuery.data.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <Card className="h-full transition-colors hover:border-slate-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  <CardDescription>
                    {client.type === 'BUSINESS' ? 'Business' : 'Individual'} · created{' '}
                    {new Date(client.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-sm text-slate-300">
                    Status: <span className="font-medium">{client.status}</span>
                  </p>
                  <p className="text-sm text-slate-300">
                    Onboarding: <span className="font-medium">{client.onboardingStatus}</span>
                  </p>
                  <p className="text-sm text-slate-400">
                    {client.directEmail} · {client.directPhone}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

