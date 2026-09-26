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
 */
export default function RegisterPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      {/* Ambient backdrop - the same layered-glow recipe as the landing hero and
          the login page, so the glass auth card below has something colourful
          to blur (see the APP-SIDE BLUR BUDGET in globals.css). Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block rounded text-2xl font-bold tracking-tight transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-2 text-sm text-slate-400">Create your account</p>
        </div>
        <Card surface="glass" className="rounded-2xl">
          <CardHeader>
            <CardTitle>नमस्ते 👋 मैं SocialOps हूँ</CardTitle>
            <CardDescription>
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
            className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
