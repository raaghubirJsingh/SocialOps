'use client';

import type { ClientDto } from '@/types/client';
import { ClientStatusBanner } from './client-status-banner';
import { OnboardingPendingBanner } from './onboarding-pending-banner';

interface ClientDashboardShellProps {
  client: ClientDto;
}

/**
 * Client dashboard layout shell.
 * Renders the client profile summary with status banners.
 */
export function ClientDashboardShell({ client }: ClientDashboardShellProps) {
  const isPending = client.onboardingStatus === 'PENDING';
  const isInactive = client.status === 'INACTIVE';
  const isSuspended = client.status === 'SUSPENDED';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Status Banners */}
      {isPending && <OnboardingPendingBanner />}
      {(isInactive || isSuspended) && (
        <ClientStatusBanner status={client.status} reason={client.statusReason} />
      )}

      {/* Profile Summary */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Profile</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-400">Name</dt>
            <dd className="text-slate-100">{client.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Type</dt>
            <dd className="text-slate-100">{client.type}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Email</dt>
            <dd className="text-slate-100">{client.directEmail}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Phone</dt>
            <dd className="text-slate-100">{client.directPhone}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Status</dt>
            <dd className="text-slate-100">{client.status}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Onboarding</dt>
            <dd className="text-slate-100">{client.onboardingStatus}</dd>
          </div>
          {client.industry && (
            <div>
              <dt className="text-sm text-slate-400">Industry</dt>
              <dd className="text-slate-100">{client.industry}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Placeholder sections */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-slate-100">
          Agency Relationships
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Agency relationship management will appear here.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Invitations</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pending invitations will appear here.
        </p>
      </div>
    </div>
  );
}
