'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPassword } from '@/lib/auth-client';

/**
 * Schema for the forgot password form.
 * Mirrors the backend ForgotPasswordDto.
 */
const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const forgotPasswordResolver: Resolver<ForgotPasswordFormValues> = async (raw) => {
  const result = forgotPasswordSchema.safeParse(raw);
  if (result.success) {
    return { values: result.data, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString();
    if (!key) continue;
    if (errors[key]) continue;
    errors[key] = { type: 'validation', message: issue.message };
  }
  return { values: {} as Record<string, never>, errors };
};

export function ForgotPasswordClient() {
  const [state, setState] = useState<'idle' | 'submitting' | 'queued'>('idle');
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: forgotPasswordResolver,
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setState('submitting');
    try {
      await forgotPassword({ email: values.email });
      // Backend always returns {"status": "queued"} to prevent email enumeration
      setState('queued');
    } catch {
      setError('Unable to process the request. Please try again.');
      setState('idle');
    }
  });

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-bold tracking-tight"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-2 text-sm text-slate-400">Reset your password</p>
        </div>

        <div className="surface-glass space-y-4 rounded-2xl p-6">
          {state === 'queued' ? (
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-semibold">Password reset initiated</h2>
              <p className="text-sm text-slate-400">
                If the email address exists in our system and the account is
                active, a password reset link has been sent to your email.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={errors.email ? 'true' : undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  disabled={isSubmitting}
                  {...register('email')}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </Button>

              <div className="text-center text-sm text-slate-400">
                <Link
                  href="/login"
                  className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}