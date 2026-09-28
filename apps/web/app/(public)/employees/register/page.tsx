import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterEmployeeForm } from '@/components/auth/register-employee-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Employee Registration · SocialOps',
  description: 'Create your SocialOps employee account.',
};

/**
 * Employee registration route (/employees/register) — public.
 *
 * Employee Module V1 (Phase 3). Collects fullName, email, phone, and
 * password. NO accountType selector (AGENTS.md §17.1 — employee is
 * discriminated by the 1:1 EmployeeProfile row). On success, the
 * existing email verification flow is activated: the user is sent to
 * /verify-email with the same status discriminator as standard
 * registration.
 *
 * Registration NEVER creates an authenticated session — the backend
 * issues no tokens until the email is verified (and only at /login).
 */
export default function EmployeeRegisterPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-slate-100 sm:p-6">
      {/* Ambient backdrop - the same layered-glow recipe as the landing hero
          and the register page, so the single glass auth modal below has
          something colourful to blur (see the APP-SIDE BLUR BUDGET in
          globals.css). Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute inset-0 bg-grid-faint" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
        <div className="absolute inset-0 bg-registration-focus-glow" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-block rounded text-2xl font-bold tracking-tight transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-1.5 text-sm font-medium text-slate-300">
            Create your employee account
          </p>
        </div>
        <Card surface="glass" className="rounded-3xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-50">
              Create your employee account
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-slate-300">
              Enter your details. We will email you a verification link
              before you can sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterEmployeeForm />
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
