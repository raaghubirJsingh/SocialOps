import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ForgotPasswordClient } from '@/components/auth/forgot-password-client';

export const metadata: Metadata = {
  title: 'Forgot password · SocialOps',
  description: 'Reset your SocialOps password.',
};

/**
 * Password reset request route (/forgot-password) — public.
 *
 * Users enter their email to request a password reset link.
 * The backend response is always {"status": "queued"} to prevent
 * email enumeration - the UI treats all responses the same way.
 */
export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
            <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
          </div>
          <p className="relative text-sm text-slate-400">Loading…</p>
        </div>
      }
    >
      <ForgotPasswordClient />
    </Suspense>
  );
}