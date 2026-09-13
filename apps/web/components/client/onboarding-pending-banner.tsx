'use client';

import Link from 'next/link';

/**
 * Banner shown when client onboarding is PENDING.
 * Directs user to complete onboarding.
 */
export function OnboardingPendingBanner() {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200"
    >
      <p className="font-medium">Your account is being set up</p>
      <p className="mt-1 text-amber-300/80">
        Complete onboarding to access all features.
      </p>
      <Link
        href="/client/onboarding"
        className="mt-2 inline-block text-amber-200 underline hover:text-amber-100"
      >
        Continue onboarding
      </Link>
    </div>
  );
}
