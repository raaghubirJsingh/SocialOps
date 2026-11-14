import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Employee / Freelancer Registration · SocialOps',
  description: 'Choose between Employee and Freelancer registration.',
};

export default function EmployeeFreelancerChoicePage() {
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
          <p className="mt-1.5 text-sm font-medium text-slate-300">Staff and Contractor Registration</p>
        </div>

        <Card surface="glass" className="rounded-3xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-50">
              Select your role
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-slate-300">
              Are you registering as a SocialOps staff member or an independent freelancer?
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Button asChild variant="secondary" className="h-24 flex-col gap-1 rounded-2xl">
              <Link href="/employees/register">
                <span className="text-base font-semibold">Employee</span>
                <span className="text-xs font-normal text-slate-400 text-center px-2">Internal staff member</span>
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-24 flex-col gap-1 rounded-2xl">
              <Link href="/freelancers/register">
                <span className="text-base font-semibold">Freelancer</span>
                <span className="text-xs font-normal text-slate-400 text-center px-2">Independent contractor</span>
              </Link>
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="rounded font-medium text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-slate-500">
          Not looking for staff registration?{' '}
          <Link href="/register" className="text-blue-400 hover:underline">
            Back to account selection
          </Link>
        </p>
      </div>
    </div>
  );
}