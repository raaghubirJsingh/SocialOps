'use client';

import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  registerEmployee as registerEmployeeAccount,
} from '@/lib/auth-client';
import type { RegisterResult } from '@/types/auth';

/**
 * Employee registration form (Employee Module V1, Phase 3).
 *
 * Collects EXACTLY: fullName, email, phone (optional), password, and
 * confirmPassword (UI-only). NO accountType selector — employee is
 * discriminated by the 1:1 EmployeeProfile row, not AccountType
 * (AGENTS.md §17.1).
 *
 * The form follows the same conventions as register-form.tsx:
 *   - React Hook Form + hand-rolled Zod resolver (Zod 4 compatibility)
 *   - confirmPassword is UI-only; never sent to the backend
 *   - On success, the same post-registration navigation as /register:
 *     verification_required -> /verify-email, registration_complete -> /login
 *
 * Registration NEVER issues tokens or a session (approved contract): the
 * backend creates the User + EmployeeProfile atomically, queues a
 * verification email (production), or auto-verifies (dev-only bypass).
 */

const registerEmployeeSchema = z
  .object({
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .max(200, 'Full name must be 200 characters or fewer'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format'),
    phone: z
      .string()
      .min(1, 'Phone is too short')
      .max(50, 'Phone is too long')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type RegisterEmployeeFormValues = z.infer<
  typeof registerEmployeeSchema
>;

const registerEmployeeResolver: Resolver<RegisterEmployeeFormValues> = async (
  raw,
) => {
  const result = registerEmployeeSchema.safeParse(raw);
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

export function RegisterEmployeeForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterEmployeeFormValues>({
    resolver: registerEmployeeResolver,
    mode: 'onBlur',
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsLoading(true);
    try {
      // Registration issues NO tokens and saves NO session: the backend
      // creates the User + EmployeeProfile atomically and queues a
      // verification email. The response discriminator guides the same
      // post-registration navigation as standard registration.
      //
      // confirmPassword is intentionally NOT sent to the backend
      // (UI-only validation).
      const { confirmPassword: _confirm, phone, ...payload } = values;
      void _confirm;
      const result: RegisterResult = await registerEmployeeAccount({
        fullName: payload.fullName,
        email: payload.email,
        phone: phone && phone.length > 0 ? phone : undefined,
        password: payload.password,
      });

      if (result.status === 'registration_complete') {
        // Dev-only bypass: account is already ACTIVE + verified.
        // Route to /login — registration creates the account, login
        // creates the session. No auto-login.
        router.push('/login');
      } else {
        // status === 'verification_required' (production path).
        // The user must complete email verification before they can
        // sign in. Forward both the registered email and the
        // `status=sent` discriminator so the verify-email page can
        // pre-fill the resend form.
        const params = new URLSearchParams({
          status: 'sent',
          email: result.email,
        });
        router.push(`/verify-email?${params.toString()}`);
      }
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="space-y-5"
      aria-describedby={submitError ? 'register-employee-error' : undefined}
    >
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          type="text"
          autoComplete="name"
          maxLength={200}
          aria-invalid={errors.fullName ? 'true' : undefined}
          aria-describedby={
            errors.fullName ? 'fullName-error' : undefined
          }
          disabled={isLoading}
          {...register('fullName')}
        />
        {errors.fullName && (
          <p id="fullName-error" className="text-xs text-red-400">
            {errors.fullName.message}
          </p>
        )}
      </div>

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
        <Label htmlFor="phone">
          Phone
          <span className="ml-1 text-xs font-normal text-slate-500">
            (optional)
          </span>
        </Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          maxLength={50}
          aria-invalid={errors.phone ? 'true' : undefined}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          disabled={isLoading}
          {...register('phone')}
        />
        {errors.phone && (
          <p id="phone-error" className="text-xs text-red-400">
            {errors.phone.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
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

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? 'true' : undefined}
          aria-describedby={
            errors.confirmPassword ? 'confirmPassword-error' : undefined
          }
          disabled={isLoading}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p
            id="confirmPassword-error"
            className="text-xs text-red-400"
          >
            {errors.confirmPassword.message}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Re-enter the password to confirm. This field is for your
          protection; it is never sent to our servers.
        </p>
      </div>

      {submitError && (
        <div
          id="register-employee-error"
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account…' : 'Create employee account'}
      </Button>
    </form>
  );
}