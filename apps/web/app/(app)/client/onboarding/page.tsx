'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { OnboardingPendingBanner } from '@/components/client/onboarding-pending-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import type { StartOnboardingResponse } from '@/types/client';
import { ApiError } from '@/lib/api';

export default function ClientOnboardingPage() {
  const router = useRouter();
  const { session } = useSession();

  const [step, setStep] = React.useState<'identify-required' | 'start' | 'verify'>('identify-required');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [startedClient, setStartedClient] = React.useState<StartOnboardingResponse | null>(null);

  const [startupForm, setStartupForm] = React.useState({
    type: '' as 'INDIVIDUAL' | 'BUSINESS' | '',
    name: session?.user.fullName ?? '',
    directEmail: session?.email ?? '',
    directPhone: '' as string,
  });
  const [startupErrors, setStartupErrors] = React.useState<Record<string, string>>({});
  const [verifyToken, setVerifyToken] = React.useState('');
  const [verifyErrors, setVerifyErrors] = React.useState<Record<string, string>>({});

  const startValid =
    startupForm.type !== '' &&
    startupForm.name.trim().length > 0 &&
    startupForm.directEmail.trim().length > 0 &&
    startupForm.directPhone.trim().length > 0;

  const handleStartSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!startValid || loading) return;

    const clientType = startupForm.type;
    if (clientType === '') return;

    setError(null);
    setStartupErrors({});
    setLoading(true);

    try {
      const response = await clientApi.startOnboarding({
        type: clientType,
        name: startupForm.name.trim(),
        directEmail: startupForm.directEmail.trim(),
        directPhone: startupForm.directPhone.trim(),
      });
      setStartedClient(response);
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Your account type is not eligible, or your email is not verified.');
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setError('A client profile already exists for your account.');
        return;
      }
      setError('Unable to start onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!verifyToken.trim() || loading) return;

    setError(null);
    setVerifyErrors({});
    setLoading(true);

    try {
      await clientApi.activateOnboarding({ token: verifyToken.trim() });
      router.push('/client');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setVerifyErrors((prev) => ({
          ...prev,
          token: 'This verification code is invalid, has already been used, or has expired.',
        }));
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setVerifyErrors((prev) => ({ ...prev, token: 'The verification code is invalid.' }));
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setError('Onboarding has already been completed for this client.');
        return;
      }
      setError('Unable to verify the mobile code. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-8 px-4 py-12">
          <div className="mx-auto flex max-w-md flex-col gap-6 text-center">
            <OnboardingPendingBanner />

            {step === 'identify-required' && (
              <>
                <div className="space-y-3">
                  <h1 className="text-2xl font-semibold text-slate-100">Set up your client profile</h1>
                  <p className="text-center text-sm text-slate-400">Complete the two steps below to finish onboarding.</p>
                </div>

                <ol className="flex flex-col gap-4 text-left">
                  <li className="flex items-start gap-3 rounded-lg bg-slate-800/40 p-3 text-left text-sm text-slate-200">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">1</span>
                    <div>
                      <p className="font-medium text-slate-100">Confirm client details</p>
                      <p className="text-slate-400">Confirm or update the client name, direct email, and direct phone.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-lg bg-slate-800/40 p-3 text-left text-sm text-slate-200">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">2</span>
                    <div>
                      <p className="font-medium text-slate-100">Verify mobile number</p>
                      <p className="text-slate-400">Enter the one-time verification code sent to your direct mobile.</p>
                    </div>
                  </li>
                </ol>

                <div className="flex justify-center">
                  <Button type="button" onClick={() => setStep('start')} disabled={loading} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    Continue
                  </Button>
                </div>
              </>
            )}

            {step === 'start' && (
              <>
                <div className="space-y-3">
                  <h1 className="text-2xl font-semibold text-slate-100">Confirm client details</h1>
                  <p className="text-sm text-slate-400">These details will be used to create your client profile. Pre-filled values come from your account where available.</p>
                </div>

                <form onSubmit={handleStartSubmit} className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="type" className="text-sm font-medium text-slate-300">Client type</Label>
                    <select
                      id="type"
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      value={startupForm.type}
                      onChange={(e) => setStartupForm((prev) => ({ ...prev, type: e.target.value as 'INDIVIDUAL' | 'BUSINESS' | '' }))}
                      autoComplete="off"
                    >
                      <option value="">Select client type</option>
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="BUSINESS">Business</option>
                    </select>
                    {startupErrors.type && <p className="text-xs text-red-400">{startupErrors.type}</p>}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="name" className="text-sm font-medium text-slate-300">Client name</Label>
                    <Input
                      id="name"
                      type="text"
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      placeholder="e.g. Acme Inc or Jane Doe"
                      value={startupForm.name}
                      onChange={(e) => setStartupForm((prev) => ({ ...prev, name: e.target.value }))}
                      autoComplete="organization"
                    />
                    {startupErrors.name && <p className="text-xs text-red-400">{startupErrors.name}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="directEmail" className="text-sm font-medium text-slate-300">Direct email</Label>
                    <Input
                      id="directEmail"
                      type="email"
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      placeholder="you@company.com"
                      value={startupForm.directEmail}
                      onChange={(e) => setStartupForm((prev) => ({ ...prev, directEmail: e.target.value }))}
                      autoComplete="email"
                    />
                    {startupErrors.directEmail && <p className="text-xs text-red-400">{startupErrors.directEmail}</p>}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="directPhone" className="text-sm font-medium text-slate-300">Direct phone</Label>
                    <Input
                      id="directPhone"
                      type="tel"
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      placeholder="+1234567890"
                      value={startupForm.directPhone}
                      onChange={(e) => setStartupForm((prev) => ({ ...prev, directPhone: e.target.value }))}
                      autoComplete="tel"
                    />
                    {startupErrors.directPhone && <p className="text-xs text-red-400">{startupErrors.directPhone}</p>}
                  </div>

                  {error && (
                    <div role="alert" className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>
                  )}

                  <div className="flex justify-center">
                    <div className="flex w-full max-w-xs flex-col gap-3">
                      <Button type="submit" disabled={loading || !startValid} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                        {loading ? 'Creating profile…' : 'Continue to verification'}
                      </Button>
                      <Link href="/client" className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                        Back
                      </Link>
                    </div>
                  </div>
                </form>
              </>
            )}

            {step === 'verify' && (
              <>
                <div className="space-y-3">
                  <h1 className="text-2xl font-semibold text-slate-100">Verify your mobile number</h1>
                  <p className="text-sm text-slate-400">Enter the verification code sent to your direct mobile number.</p>
                </div>

                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-slate-400">Client name</p>
                  <p className="font-medium text-slate-200">{startupForm.name.trim() || '—'}</p>
                </div>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-slate-400">Direct email</p>
                  <p className="font-medium text-slate-200">{startupForm.directEmail.trim() || '—'}</p>
                </div>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-slate-400">Direct phone</p>
                  <p className="font-medium text-slate-200">{startupForm.directPhone.trim() || '—'}</p>
                </div>
                <p className="text-xs text-slate-500">Step 2 of 2</p>
                {startedClient?.mobileVerificationExpiresAt && (
                  <p className="text-xs text-slate-500">
                    Code expires {new Date(startedClient.mobileVerificationExpiresAt).toLocaleTimeString()}.
                  </p>
                )}

                <p className="text-left text-sm text-slate-300">
                  Verification codes are delivered through a controlled channel. If you are expecting a code, check your account communications.
                </p>
                <p className="text-xs text-slate-500">
                  <strong className="text-slate-300">Development note:</strong> The verification code is logged to the server console when{' '}
                  <code className="text-slate-300">BOOT_ARTIFACTS_ALLOWED=true</code>. In production, it will be sent via SMS (deferred).
                </p>

                <form onSubmit={handleVerifySubmit} className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="token" className="text-sm font-medium text-slate-300">Verification code</Label>
                    <Input
                      id="token"
                      type="text"
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      placeholder="e.g. 123456"
                      value={verifyToken}
                      onChange={(e) => {
                        setVerifyToken(e.target.value);
                        if (verifyErrors.token) {
                          setVerifyErrors((prev) => ({ ...prev, token: '' }));
                        }
                      }}
                      autoComplete="one-time-code"
                    />
                    {verifyErrors.token && <p className="text-xs text-red-400">{verifyErrors.token}</p>}
                  </div>

                  {error && (
                    <div role="alert" className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>
                  )}

                  <div className="flex justify-center">
                    <div className="flex w-full max-w-xs flex-col gap-3">
                      <Button type="submit" disabled={loading || !verifyToken.trim()} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                        {loading ? 'Verifying…' : 'Verify & complete setup'}
                      </Button>
                      <Link href="/client" className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                        Back
                      </Link>
                    </div>
                  </div>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}