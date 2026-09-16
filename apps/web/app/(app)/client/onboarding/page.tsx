'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/hooks/use-session';

/**
 * Client Onboarding Page.
 *
 * This page is now a redirect target: direct access to /client/onboarding
 * redirects to /client, where the ClientActivationPanel is embedded in the
 * dashboard. The multi-page onboarding flow has been consolidated into the
 * activation panel for a centralized, strictly-controlled flow.
 *
 * Governance notes:
 *   - Email is verified at sign-up and is strictly READ-ONLY here.
 *   - Name is editable and pre-filled from the session.
 *   - Phone is REQUIRED (validated before submit).
 *   - No backend change: uses the existing start + activate endpoints.
 */
export default function ClientOnboardingPage() {
  const router = useRouter();
  const { isAuthenticated } = useSession();

  // Redirect to /client if authenticated — the activation panel is now
  // embedded in the dashboard. Unauthenticated users should not reach here
  // (AuthGuard should intercept), but if they do, redirect to login.
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/client');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  // Show nothing while redirecting (avoids flash of content).
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-slate-400">Redirecting to dashboard…</p>
    </div>
  );
}

