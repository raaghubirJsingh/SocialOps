import { Suspense } from 'react';
import type { Metadata } from 'next';

import { VerifyEmailClient } from '@/components/auth/verify-email-client';

export const metadata: Metadata = {
  title: 'Verify email · SocialOps',
  description: 'Verify your SocialOps email address.',
};

/**
 * Email verification route (/verify-email) — public.
 *
 * The verification link carries the one-time token as the `token`
 * query parameter. The raw token is consumed by the client component
 * and is NEVER displayed in the UI. Without a token the page shows
 * the "check your inbox" state with the generic resend option.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
          {/* Matches the loaded page's ambient layer so there is no flash
              between the fallback and the hydrated client component. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
            <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
          </div>
          <p className="relative text-sm text-slate-400">Loading…</p>
        </div>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}