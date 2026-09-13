'use client';

import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  register as registerAccount,
} from '@/lib/auth-client';
import type { AccountType } from '@/types/auth';

/**
 * Public registration form (AGENTS.md §17).
 *
 * The form renders EXACTLY two account-type choices:
 *   - Service Provider
 *   - Individual / Business
 * It does NOT offer Employee, Manager, Client, or any other option
 * (AGENTS.md §17.1).
 *
 * Field contract (AGENTS.md §17.2):
 *   - accountType     required
 *   - fullName        required
 *   - email           required
 *   - phone           optional
 *   - password        required (min 8)
 *   - confirmPassword required UI-only; never sent to backend
 *
 * The resolver is hand-rolled (same rationale as login-form.tsx): the
 * workspace's hoisted Zod version is incompatible with the
 * `@hookform/resolvers` package protocol.
 */

const accountTypeValues = [
  'SERVICE_PROVIDER',
  'INDIVIDUAL_BUSINESS',
] as const satisfies readonly AccountType[];

const registerSchema = z
  .object({
    accountType: z.enum(accountTypeValues, {
      errorMap: () => ({
        message: 'Please choose how you will use SocialOps',
      }),
    }),
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

export type RegisterFormValues = z.infer<typeof registerSchema>;

const registerResolver: Resolver<RegisterFormValues> = async (raw) => {
  const result = registerSchema.safeParse(raw);
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

export function RegisterForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterFormValues>({
    resolver: registerResolver,
    mode: 'onBlur',
    defaultValues: {
      accountType: undefined as unknown as AccountType,
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Watch `accountType` so the radio group's visual selection stays
  // in sync with the underlying form state.
  const selectedAccountType = watch('accountType');

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsLoading(true);
    try {
      // Registration issues NO tokens and saves NO session: the backend
      // creates an INACTIVE unverified user and queues a verification
      // email (AGENTS.md §17.2). The backend response carries
      // `status: 'verification_required'` and the registered email;
      // we forward both to /verify-email so the page can show the
      // "check your inbox" state and offer the generic resend option.
      // The raw verification token is never exposed here - it lives
      // only in the URL the backend logs locally.
      //
      // In the dev-only bypass (AUTH_DEV_AUTO_VERIFY_REGISTER +
      // NODE_ENV !== 'production'), the backend returns
      // `status: 'registration_complete'`. We then route the user to
      // /login so the existing authentication boundary is preserved:
      // registration creates the account; login creates the session.
      // We never auto-login and never infer state from a second API
      // call - the discriminator is server-blessed.
      //
      // confirmPassword is intentionally NOT sent to the backend
      // (UI-only validation).
      const { confirmPassword: _confirm, phone, ...payload } = values;
      void _confirm;
      const result = await registerAccount({
        accountType: payload.accountType,
        fullName: payload.fullName,
        email: payload.email,
        phone: phone && phone.length > 0 ? phone : undefined,
        password: payload.password,
      });

      if (result.status === 'registration_complete') {
        // Dev-only bypass: account is already ACTIVE + verified. Send
        // the user to /login so they can sign in normally. We do NOT
        // call login automatically - that would change the
        // authentication boundary (registration creates the account,
        // login creates the session).
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
      router.refresh();
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
      aria-describedby={submitError ? 'register-error' : undefined}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-100">
          How will you use SocialOps?
        </legend>
        <p className="text-xs text-slate-400">
          Choose the option that best describes your intended use.
        </p>
        <div className="space-y-2">
          <label
            htmlFor="accountType-service-provider"
            className={
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ' +
              (selectedAccountType === 'SERVICE_PROVIDER'
                ? 'border-blue-500/60 bg-blue-500/5'
                : 'border-slate-700 bg-slate-900/40 hover:border-slate-500')
            }
          >
            <input
              id="accountType-service-provider"
              type="radio"
              value="SERVICE_PROVIDER"
              className="mt-1 h-4 w-4 cursor-pointer accent-blue-500"
              disabled={isLoading}
              {...register('accountType')}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-100">
                Service Provider
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                If you provide social-media/account-handling services
                to other people or businesses, select Service
                Provider.
              </span>
            </span>
          </label>
          <label
            htmlFor="accountType-individual-business"
            className={
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ' +
              (selectedAccountType === 'INDIVIDUAL_BUSINESS'
                ? 'border-blue-500/60 bg-blue-500/5'
                : 'border-slate-700 bg-slate-900/40 hover:border-slate-500')
            }
          >
            <input
              id="accountType-individual-business"
              type="radio"
              value="INDIVIDUAL_BUSINESS"
              className="mt-1 h-4 w-4 cursor-pointer accent-blue-500"
              disabled={isLoading}
              {...register('accountType')}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-100">
                Individual / Business
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                If you want to manage your own social-media or business
                accounts, select Individual / Business.
              </span>
            </span>
          </label>
        </div>
        {errors.accountType && (
          <p className="text-xs text-red-400">
            {errors.accountType.message}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          type="text"
          autoComplete="name"
          maxLength={200}
          aria-invalid={errors.fullName ? 'true' : undefined}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
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
          id="register-error"
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}