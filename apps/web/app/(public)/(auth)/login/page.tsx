import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign in · SocialOps',
  description: 'Sign in to the SocialOps operations console.',
};

/**
 * Login route (/login) — public.
 *
 * Moved from (auth)/login into (public)/(auth): nested route groups
 * keep the URL flat (no extra path segments) while grouping all
 * public pages under (public). Only VERIFIED accounts receive tokens;
 * unverified accounts are rejected by the backend with 403.
 */
export default function LoginPage() {
    return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      {/* Ambient backdrop - the same layered-glow recipe as the landing hero.
          It exists so the single glass auth card (below) has a colourful
          backdrop to blur, which is when backdrop-filter is worth its cost
          (see the APP-SIDE BLUR BUDGET in globals.css). Decorative only. */}
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
            Sign in to your workspace
          </p>
        </div>
        <Card surface="glass" className="rounded-2xl">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use your verified email address and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-slate-400">
          Do not have an account?{' '}
          <Link
            href="/register"
            className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}