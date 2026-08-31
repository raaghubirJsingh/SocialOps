import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign in · SocialOps',
  description: 'Sign in to the SocialOps operations console.',
};

/**
 * Login route. The route group `(auth)` keeps the login URL flat
 * (no `/auth/` segment) while letting the layout omit the app shell.
 */
export default function LoginPage() {
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
            Sign in to continue
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Enter the email and password associated with your
              account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-500">
          Authentication is server-side authoritative. The frontend
          only stores the issued access and refresh tokens locally
          for the duration of the session.
        </p>
      </div>
    </div>
  );
}
