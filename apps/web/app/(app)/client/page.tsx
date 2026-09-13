'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import { useClientContext } from '@/components/client/client-provider';
import { ClientDashboardShell } from '@/components/client/client-dashboard-shell';
import { OnboardingPendingBanner } from '@/components/client/onboarding-pending-banner';

/**
 * Client dashboard page.
 * Entry point for authenticated Client users.
 */
export default function ClientPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const { client, setClient } = useClientContext();
  const clientId = searchParams.get('clientId');

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
          setClient(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load client.');
          setIsLoading(false);
        }
      }
    };

    fetchClient();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, clientId, setClient]);

  if (sessionLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
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
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-4">
        <OnboardingPendingBanner />
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            No client found. Start onboarding to create your client profile.
          </p>
          <Link
            href="/client/onboarding"
            className="mt-4 inline-block text-blue-400 hover:underline"
          >
            Start onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <ClientDashboardShell client={client} />
    </div>
  );
}
