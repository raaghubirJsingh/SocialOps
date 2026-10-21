'use client';

import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/use-session';
import { login as loginRequest } from '@/lib/auth-client';

/**
 * Super Admin login form.
 *
 * Uses the same credentials as regular login but routes to the
 * step-up challenge flow after authentication. Only users with
 * isSocialOpsAdmin = true can proceed to step-up (backend enforces).
 */
const superAdminLoginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type SuperAdminLoginFormValues = z.infer<typeof superAdminLoginSchema>;

const superAdminLoginResolver: Resolver<SuperAdminLoginFormValues> = async (raw) => {
  const result = superAdminLoginSchema.safeParse(raw);
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

export function SuperAdminLoginForm() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SuperAdminLoginFormValues>({
    resolver: superAdminLoginResolver,
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    clearError();
    try {
      await login(values);
      // Successful login for Super Admin: redirect to step-up challenge
      router.push('/super-admin/step-up');
      router.refresh();
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Sign in failed. Please try again.');
      }
    }
  });

  const errorMessage = error?.message ?? submitError;

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="space-y-5"
      aria-describedby={errorMessage ? 'login-error' : undefined}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          disabled={isLoading}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-red-400">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? 'true' : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          disabled={isLoading}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className="text-xs text-red-400">
            {errors.password.message}
          </p>
        )}
      </div>
      {errorMessage && (
        <div
          id="login-error"
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {errorMessage}
        </div>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}