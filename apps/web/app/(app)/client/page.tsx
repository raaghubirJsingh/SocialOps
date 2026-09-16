'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import {
  clearBoundClientId,
  loadBoundClientId,
  saveBoundClientId,
} from '@/lib/client-session';
import { useSession } from '@/hooks/use-session';
import { useClientContext } from '@/components/client/client-provider';
import { ClientDashboardShell } from '@/components/client/client-dashboard-shell';
import { OnboardingPendingBanner } from '@/components/client/onboarding-pending-banner';
import { ClientActivationPanel } from '@/components/dashboard/client/client-activation-panel';

/**
 * Client dashboard page.
 * Entry point for authenticated Client users.
 *
 * Flow:
 *   - If there's a valid client binding with ACTIVE onboarding → show dashboard shell
 *   - If there's a PENDING onboarding → show ClientActivationPanel (embedded)
 *   - If there's no client binding at all → show ClientActivationPanel (embedded)
 *   - The old /client/onboarding page now redirects here
 */
export default function ClientPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const { client, setClient } = useClientContext();
  // `?clientId=` is a lookup hint. When it is missing (direct sidebar or
  // dashboard navigation), fall back to the last server-verified binding.
  // The backend re-verifies the binding on every call, so neither value is
  // ever an authorization source (AGENTS.md §7).
  const clientId = searchParams.get('clientId') ?? loadBoundClientId();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, sessionLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || !clientId) {
      return;
    }

    let cancelled = false;

    const fetchClient = async () => {
      try {
        if (!cancelled) setIsLoading(true);
        const data = await clientApi.getMyClient(clientId);
        if (!cancelled) {
          // Persist the server-verified binding so sidebar/dashboard
          // shortcuts can link back without the query parameter.
          saveBoundClientId(data.id);
          setClient(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // A 403/404 means the id does not match the authenticated user's
          // current binding (stale persisted id, or the binding moved).
          // Drop it and fall through to the onboarding-prompt state
          // instead of a dead-end error.
          if (
            err instanceof ApiError &&
            (err.status === 403 || err.status === 404)
          ) {
            clearBoundClientId();
            setClient(null);
          } else {
            setError(
              err instanceof Error ? err.message : 'Failed to load client.',
            );
          }
          setIsLoading(false);
        }
      }
    };

    fetchClient();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, clientId, setClient]);

  const shouldShowLoading = Boolean(isLoading && isAuthenticated && clientId);

  if (sessionLoading || shouldShowLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-slate-100">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      </div>
    );
  }

  // Show the activation panel when:
  //   - There's no client binding at all (first-time user)
  //   - The client exists but onboarding is still PENDING
  const showActivationPanel =
    !client || (client && client.onboardingStatus === 'PENDING');

  if (showActivationPanel) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <OnboardingPendingBanner />
        <ClientActivationPanel
          onActivated={() => {
            // Refresh the client data after activation completes
            if (clientId) {
              router.refresh();
            }
          }}
          pending={client?.onboardingStatus === 'PENDING'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <ClientDashboardShell client={client!} />
    </div>
  );
}
