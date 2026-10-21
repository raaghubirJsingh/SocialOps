import type { Metadata } from 'next';
import Link from 'next/link';

import { SuperAdminLoginForm } from '@/components/super-admin/super-admin-login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Super Admin Sign In · SocialOps',
  description: 'Sign in to the SocialOps Super Admin console.',
};

/**
 * Super Admin login route (/super-admin/login) — public.
 *
 * This is the entry point for SOCIALOPS_ADMIN users. After successful
 * login, users must complete a step-up OTP verification before accessing
 * any admin routes (Decision 020).
 */
export default function SuperAdminLoginPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      {/* Ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block rounded text-2xl font-bold tracking-tight transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-2 text-sm text-slate-400">
            Super Admin Console
          </p>
        </div>
        <Card surface="glass" className="rounded-2xl">
          <CardHeader>
            <CardTitle>Super Admin Sign In</CardTitle>
            <CardDescription>
              Sign in with your verified platform admin account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SuperAdminLoginForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-slate-400">
          Return to{' '}
          <Link
            href="/login"
            className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Regular Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}