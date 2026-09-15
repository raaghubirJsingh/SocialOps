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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-bold tracking-tight"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-2 text-sm text-slate-400">
            Create your employee account
          </p>
        </div>
        <Card>
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
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-blue-400 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
