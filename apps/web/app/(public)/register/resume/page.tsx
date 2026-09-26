import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ResumeClient } from '@/components/registration/resume-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Continue registration · SocialOps',
  description: 'Continue your SocialOps registration from a secure resume link.',
};

/**
 * Resume-registration route (/register/resume) — public.
 *
 * The emailed reminder link carries the current resumeToken as the
 * `token` query parameter. The token is a registration-stage credential
 * only (OPEN-1) and is validated server-side; it never creates a session
 * and cannot be used after rotation/expiry/completion.
 */
export default function ResumeRegistrationPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
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
          <p className="mt-2 text-sm text-slate-400">Continue registration</p>
        </div>
        <Card surface="glass" className="rounded-2xl">
          <CardHeader>
            <CardTitle>आपका registration जारी रखें</CardTitle>
            <CardDescription>
              यह link सिर्फ़ आपका registration पूरा करने के लिए है — यह login
              link नहीं है। (This link only continues your registration; it is
              not a login link.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
              <ResumeClient />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}