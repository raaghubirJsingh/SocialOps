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
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}