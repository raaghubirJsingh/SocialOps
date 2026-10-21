import type { Metadata } from 'next';

import { SuperAdminStepUpChallenge } from '@/components/super-admin/super-admin-step-up-challenge';

export const metadata: Metadata = {
  title: 'Super Admin Step-Up Verification · SocialOps',
  description: 'Complete step-up verification to access the Super Admin console.',
};

/**
 * Super Admin step-up challenge route (/super-admin/step-up) — requires auth.
 *
 * After regular login, Super Admin users must complete an OTP challenge
 * before accessing any admin routes (Decision 020). This page issues the
 * challenge and then handles verification.
 */
export default function SuperAdminStepUpPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial_gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Social<span className="text-blue-400">Ops</span></h1>
          <p className="mt-2 text-sm text-slate-400">
            Super Admin Step-Up Verification
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-semibold">Step-Up Required</h2>
          <p className="mt-2 text-sm text-slate-400">
            To access the Super Admin console, complete the OTP challenge sent to your email.
          </p>
          <SuperAdminStepUpChallenge />
        </div>
      </div>
    </div>
  );
}