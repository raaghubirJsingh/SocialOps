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
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      {/* Ambient backdrop - the same layered-glow recipe as the landing hero and
          the login/register pages, so the single glass auth card below has
          something colourful to blur (see the APP-SIDE BLUR BUDGET in
          globals.css). Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
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
            Create your employee account
          </p>
        </div>
        <Card surface="glass" className="rounded-2xl">
          <CardHeader>
            <CardTitle>Create your employee account</CardTitle>
            <CardDescription>
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
            className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
