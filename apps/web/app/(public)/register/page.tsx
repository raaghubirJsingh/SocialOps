import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountTypeSelector } from '@/components/registration/account-type-selector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Register · SocialOps',
  description: 'Start your SocialOps account.',
};

/**
 * Registration route (/register) — public.
 *
 * Simple account-type selection experience. The user picks one of four
 * account options:
 *   - Client             -> /register/client
 *   - Service Provider   -> /register/agency
 *   - Employee/Freelancer -> choice page, then existing routes
 *   - News Organisation  -> /news-organisation/register
 *
 * The conversational Client/Agency discovery experience has been replaced
 * by conventional step-by-step forms. Registration NEVER creates an
 * authenticated session — the backend issues no tokens until /api/auth/login.
 *
 * Visual: the whole flow sits inside ONE centred `surface-glass` modal
 * (the single glass surface this screen is allowed - APP-SIDE BLUR BUDGET).
 * Everything blur-free inside the modal uses `surface-panel`, which gives
 * sharp 1px borders and maximum text contrast on the dark background.
 */
export default function RegisterPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-slate-100 sm:p-6">
      {/* Ambient backdrop - the same layered-glow recipe as the landing hero
          and the login page, so the glass auth modal has something colourful
          to blur (see the APP-SIDE BLUR BUDGET in globals.css), plus a faint
          grid for high-contrast edge definition. Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute inset-0 bg-grid-faint" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
        <div className="absolute inset-0 bg-registration-focus-glow" />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-block rounded text-2xl font-bold tracking-tight transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-1.5 text-sm font-medium text-slate-300">
            Create your account
          </p>
        </div>

        <Card surface="glass" className="rounded-3xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-50">
              Choose your account type
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-slate-300">
              Select the option that best describes you. Each path uses a
              conventional registration form with email and WhatsApp
              verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTypeSelector />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="rounded font-medium text-blue-400 transition-colors duration-200 hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
