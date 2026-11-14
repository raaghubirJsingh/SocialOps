'use client';

import Link from 'next/link';

import { SimpleRegistrationForm } from '@/components/registration/simple-registration-form';
import { registerAgency } from '@/lib/auth-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function AgencyRegisterPage() {
  const handleSubmit = (values: any) => registerAgency(values);
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute inset-0 bg-grid-faint" />
        <div className="absolute inset-0 bg-auth-gradient-animate" />
        <div className="absolute inset-0 bg-registration-focus-glow" />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-block rounded text-2xl font-bold tracking-tight">
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-1.5 text-sm font-medium text-slate-300">Create your Agency account</p>
        </div>

        <Card surface="glass" className="rounded-3xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-50">
              Agency Registration
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-slate-300">
              Manage social media accounts for your clients. We will verify your email and WhatsApp before you can sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleRegistrationForm
              accountType="SERVICE_PROVIDER"
              title="Service Provider / Agency"
              description="Manage accounts for your clients"
              onSubmitStart={handleSubmit}
            />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="rounded font-medium text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-slate-500">
          Not an Agency?{' '}
          <Link href="/register" className="text-blue-400 hover:underline">
            Back to account selection
          </Link>
        </p>
      </div>
    </div>
  );
}