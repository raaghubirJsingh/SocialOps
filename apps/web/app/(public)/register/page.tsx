import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/components/auth/register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Register · SocialOps',
  description: 'Create a SocialOps account.',
};

/**
 * Registration route (/register) — public.
 *
 * Email + password only (mobile/OTP/SMS are explicitly out of scope for
 * this phase). On success the account exists UNVERIFIED and the user is
 * sent to /verify-email. Registration NEVER creates an authenticated
 * session — the backend issues no tokens until the email is verified.
 */
export default function RegisterPage() {
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
          <p className="mt-2 text-sm text-slate-400">Create your account</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>
              Tell us how you plan to use SocialOps, then add your
              details. We will email you a verification link before
              you can sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}