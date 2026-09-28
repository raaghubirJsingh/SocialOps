import type { Metadata } from 'next';
import Link from 'next/link';

import { RegistrationFlow } from '@/components/registration/registration-flow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Register · SocialOps',
  description: 'Start your SocialOps account.',
};

/**
 * Registration route (/register) — public.
 *
 * Registration Phase v1.0: this route renders the approved CONVERSATIONAL
 * registration experience (discovery first, then name/WhatsApp/email,
 * dual Email + WhatsApp OTP verification, then password). The legacy
 * form-first registration is fully retired (L11); there is no alternate
 * registration path.
 *
 * Registration NEVER creates an authenticated session — the backend
 * issues no tokens until /api/auth/login.
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
        {/* Slow glow anchored on the INPUT AREA so the eye lands on the one
            field in play rather than the card title. */}
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

        {/* The ONE glass surface on this screen. The `surface` prop (not a
            className) is what selects it - stacking surface-glass onto a
            surface-panel base is an emit-order hazard documented in
            globals.css. */}
        <Card surface="glass" className="rounded-3xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-50">
              नमस्ते 👋 मैं SocialOps हूँ
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-slate-300">
              कुछ आसान सवालों से शुरू करते हैं — फिर आपका account बन जाएगा।
              (A few quick questions first, then your account.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationFlow />
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
