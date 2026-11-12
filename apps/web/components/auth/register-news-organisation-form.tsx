'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPhoneInput } from '@/components/shared/user-phone-input';
import {
  registerNewsOrganisation as registerNewsOrganisationAccount,
} from '@/lib/auth-client';
import { normalizeSelectedUserPhone } from '@/lib/user-phone';
import type { RegisterResult } from '@/types/auth';

/**
 * News Organisation registration form (REG-04, REG-05).
 *
 * Collects EXACTLY: fullName, email, phone (country+number), organisationName,
 * website?, organisationDescription?, designation?, password, and
 * confirmPassword (UI-only). NO accountType selector — News Organisation is
 * discriminated by the Organization row (kind: NEWS_ORGANIZATION), not
 * AccountType (AGENTS.md §17.1).
 *
 * The form follows the same hand-rolled ZHF resolver conventions used
 * across the auth surfaces (no new deps):
 *   - React Hook Form + hand-rolled Zod resolver (Zod 4 compatibility)
 *   - confirmPassword is UI-only; never sent to the backend
 *   - On success, the same post-registration navigation as /register:
 *     verification_required -> /verify-email, registration_complete -> /login
 *
 * Registration NEVER issues tokens or a session (approved contract): the
 * backend creates the User (SERVICE_PROVIDER accountType) + Organization
 * (kind: NEWS_ORGANIZATION, verificationStatus: PENDING) atomically, queues
 * a verification email (production), or auto-verifies (dev-only bypass).
 */
const registerNewsOrganisationSchema = z
  .object({
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .max(200, 'Full name must be 200 characters or fewer'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format'),
    phoneCountry: z.string().min(1, 'Select a country'),
    phone: z
      .string()
      .trim()
      .min(1, 'Mobile number is required')
      .max(50),
    organisationName: z
      .string()
      .min(1, 'Organisation name is required')
      .max(200, 'Organisation name must be 200 characters or fewer'),
    website: z
      .string()
      .max(200, 'Website URL must be 200 characters or fewer')
      .url({ message: 'Invalid URL' })
      .optional(),
    organisationDescription: z
      .string()
      .max(500, 'Description must be 500 characters or fewer')
      .optional(),
    designation: z
      .string()
      .max(100, 'Designation must be 100 characters or fewer')
      .optional(),
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
  })
  .superRefine(({ phoneCountry, phone }, ctx) => {
    if (!normalizeSelectedUserPhone(phoneCountry, phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Enter a valid mobile number for the selected country',
      });
    }
  });

export type RegisterNewsOrganisationFormValues = z.infer<
  typeof registerNewsOrganisationSchema
>;

const registerNewsOrganisationResolver: Resolver<RegisterNewsOrganisationFormValues> = async (
  raw,
) => {
  const result = registerNewsOrganisationSchema.safeParse(raw);
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

export function RegisterNewsOrganisationForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterNewsOrganisationFormValues>({
    resolver: registerNewsOrganisationResolver,
    mode: 'onBlur',
    defaultValues: {
      fullName: '',
      email: '',
      phoneCountry: '',
      phone: '',
      organisationName: '',
      website: '',
      organisationDescription: '',
      designation: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsLoading(true);
    try {
      // Registration issues NO tokens and saves NO session: the backend
      // creates the User (SERVICE_PROVIDER accountType) + Organization
      // (kind: NEWS_ORGANIZATION, verificationStatus: PENDING) atomically,
      // and queues a verification email. The response discriminator guides
      // the same post-registration navigation as standard registration.
      //
      // confirmPassword is intentionally NOT sent to the backend
      // (UI-only validation).
      const {
        confirmPassword: _confirm,
        phoneCountry,
        phone,
        organisationName,
        website,
        organisationDescription,
        designation,
        ...payload
      } = values;
      void _confirm;
      const result: RegisterResult = await registerNewsOrganisationAccount({
        fullName: payload.fullName,
        email: payload.email,
        phone: { country: phoneCountry, number: phone },
        organisationName: organisationName,
        website: website,
        organisationDescription: organisationDescription,
        designation: designation,
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
      aria-describedby={submitError ? 'register-news-organisation-error' : undefined}
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

      <Controller
        control={control}
        name="phoneCountry"
        render={({ field: countryField }) => (
          <Controller
            control={control}
            name="phone"
            render={({ field: numberField }) => (
              <UserPhoneInput
                idPrefix="news-organisation-phone"
                country={countryField.value}
                number={numberField.value}
                onCountryChange={countryField.onChange}
                onNumberChange={numberField.onChange}
                disabled={isLoading}
                error={errors.phone?.message ?? errors.phoneCountry?.message}
              />
            )}
          />
        )}
      />
      <p className="text-xs text-slate-400">
        Select the country first; only valid mobile numbers are accepted.
      </p>

      <div className="space-y-2">
        <Label htmlFor="organisationName">Organisation name</Label>
        <Input
          id="organisationName"
          type="text"
          autoComplete="name"
          maxLength={200}
          aria-invalid={errors.organisationName ? 'true' : undefined}
          aria-describedby={
            errors.organisationName ? 'organisationName-error' : undefined
          }
          disabled={isLoading}
          {...register('organisationName')}
        />
        {errors.organisationName && (
          <p id="organisationName-error" className="text-xs text-red-400">
            {errors.organisationName.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website (optional)</Label>
        <Input
          id="website"
          type="url"
          autoComplete="url"
          aria-invalid={errors.website ? 'true' : undefined}
          aria-describedby={
            errors.website ? 'website-error' : undefined
          }
          disabled={isLoading}
          {...register('website')}
        />
        {errors.website && (
          <p id="website-error" className="text-xs text-red-400">
            {errors.website.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="organisationDescription">Organisation description (optional)</Label>
        <Input
          id="organisationDescription"
          type="text"
          autoComplete="text"
          aria-invalid={errors.organisationDescription ? 'true' : undefined}
          aria-describedby={
            errors.organisationDescription ? 'organisationDescription-error' : undefined
          }
          disabled={isLoading}
          {...register('organisationDescription')}
        />
        {errors.organisationDescription && (
          <p id="organisationDescription-error" className="text-xs text-red-400">
            {errors.organisationDescription.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="designation">Designation (optional)</Label>
        <Input
          id="designation"
          type="text"
          autoComplete="name"
          aria-invalid={errors.designation ? 'true' : undefined}
          aria-describedby={
            errors.designation ? 'designation-error' : undefined
          }
          disabled={isLoading}
          {...register('designation')}
        />
        {errors.designation && (
          <p id="designation-error" className="text-xs text-red-400">
            {errors.designation.message}
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
        <p className="text-xs text-slate-400">
          Re-enter the password to confirm. This field is for your
          protection; it is never sent to our servers.
        </p>
      </div>

      {submitError && (
        <div
          id="register-news-organisation-error"
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account…' : 'Create news organisation account'}
      </Button>
    </form>
  );
}