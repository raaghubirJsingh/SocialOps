'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '@/lib/auth-client';

/**
 * Schema for the reset password form.
 * Mirrors the backend ResetPasswordDto.
 */
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const resetPasswordResolver: Resolver<ResetPasswordFormValues> = async (raw) => {
  const result = resetPasswordSchema.safeParse(raw);
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

/**
 * Password reset completion flow (client component for /reset-password).
 *
 * The token comes from the reset link as a query parameter. The raw token
 * is consumed exactly once via POST /api/auth/reset-password. It is NEVER
 * displayed in the UI.
 *
 * Invalid, expired, and already-used tokens all produce the same generic
 * backend error (no condition leaked).
 */
export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Store token to avoid React strict mode double-submit
  const submittedTokenRef = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: resetPasswordResolver,
    mode: 'onChange',
    defaultValues: { token: token ?? '', password: '' },
  });

  // If no token, show error
  useEffect(() => {
    if (!token) {
      setState('error');
      setError('Invalid or expired reset link. Request a new password reset.');
    }
  }, [token]);

  const onSubmit = handleSubmit(async (values) => {
    if (!token || submittedTokenRef.current === token) return;

    submittedTokenRef.current = token;
    setError(null);
    setState('submitting');

    try {
      await resetPassword({ token: values.token, password: values.password });
      // On success, backend returns new session - redirect to dashboard
      setState('success');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Invalid or expired reset token. Request a new password reset link.');
      setState('error');
      submittedTokenRef.current = null;
    }
  });

  // Don't render form if no token
  if (!token) {
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
          <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="mb-8 text-center">
            <a href="/" className="inline-block text-2xl font-bold tracking-tight">
              Social<span className="text-blue-400">Ops</span>
            </a>
            <p className="mt-2 text-sm text-slate-400">Reset password</p>
          </div>

          <div className="surface-glass rounded-2xl p-6">
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-semibold">Invalid or expired link</h2>
              <p className="text-sm text-slate-400">
                This password reset link is invalid or has expired.
              </p>
              <Button asChild className="w-full">
                <a href="/forgot-password">Request a new reset link</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return null; // Will redirect before render
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <a href="/" className="inline-block text-2xl font-bold tracking-tight">
            Social<span className="text-blue-400">Ops</span>
          </a>
          <p className="mt-2 text-sm text-slate-400">Set your new password</p>
        </div>

        <div className="surface-glass space-y-4 rounded-2xl p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? 'true' : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                disabled={isSubmitting}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="text-xs text-red-400">
                  {errors.password.message}
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

            <Button type="submit" className="w-full" disabled={isSubmitting || state === 'error'}>
              {isSubmitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>

          <div className="text-center text-sm text-slate-400">
            <a
              href="/forgot-password"
              className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              Need a new reset link?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}