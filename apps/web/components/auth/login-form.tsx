'use client';

import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/use-session';
import { OtpInput } from './otp-input';

/**
 * Step 1: email + password form schema.
 * Mirrors the backend `LoginDto` zod schema exactly.
 */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

const loginResolver: Resolver<LoginFormValues> = async (raw) => {
  const result = loginSchema.safeParse(raw);
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
 * Step 2: OTP verification schema.
 */
const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export type OtpFormValues = z.infer<typeof otpSchema>;

const otpResolver: Resolver<OtpFormValues> = async (raw) => {
  const result = otpSchema.safeParse(raw);
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
 * Two-step login form (single-box login with mandatory email OTP).
 *
 * Step 1: User enters email + password → POST /api/auth/login
 *   - On success (otp_required): transition to step 2
 *   - On error: show error, stay on step 1
 *
 * Step 2: User enters 6-digit OTP → POST /api/auth/login/verify-otp
 *   - On success: redirect to /dashboard
 *   - On error: show error, stay on step 2
 *   - Resend button with 60-second cooldown
 *   - "Back to password" link to re-authenticate
 */
export function LoginForm() {
  const router = useRouter();
  const { login, verifyLoginOtp, resendLoginOtp, isLoading, error, clearError } = useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(3);
  const [maskedEmail, setMaskedEmail] = useState('');

  // Email/password form (step 1)
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<LoginFormValues>({
    resolver: loginResolver,
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });

  // OTP form (step 2)
  const {
    register: registerOtp,
    handleSubmit: handleSubmitOtp,
    formState: { errors: otpErrors },
    reset: resetOtp,
    setValue: setValueOtp,
    watch: watchOtp,
  } = useForm<OtpFormValues>({
    resolver: otpResolver,
    mode: 'onChange',
    defaultValues: { otp: '' },
  });

  // Watch email field for masking
  const emailValue = watch('email');

  // Watch OTP field for the OTP input
  const otpValue = watchOtp('otp');

  // Countdown timer for resend cooldown
  useState(() => {
    if (resendCooldown > 0) {
      const interval = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    clearError();
    try {
      const result = await login(values);
      if ('status' in result && result.status === 'otp_required') {
        // Step 1 successful: OTP challenge issued
        setMaskedEmail(maskEmail(result.email));
        setStep('otp');
        resetOtp();
        setResendCooldown(60);
        setResendRemaining(3);
      } else {
        // Should not happen with new flow, but handle gracefully
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Sign in failed. Please try again.');
      }
    }
  });

  const onSubmitOtp = handleSubmitOtp(async (values) => {
    setSubmitError(null);
    clearError();
    try {
      await verifyLoginOtp({ email: emailValue, otp: values.otp });
      // Successful verified login lands on the protected dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Invalid or expired code. Please try again.');
      }
    }
  });

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setSubmitError(null);
    clearError();
    try {
      const result = await resendLoginOtp(emailValue);
      if (result.sendStatus === 'sent') {
        setResendCooldown(60);
        setResendRemaining(result.resendRemaining);
      }
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Failed to resend code. Please try again.');
      }
    }
  }, [emailValue, resendCooldown, resendLoginOtp, clearError]);

  const handleBackToPassword = useCallback(() => {
    setStep('password');
    setSubmitError(null);
    clearError();
    resetOtp();
    setResendCooldown(0);
    setResendRemaining(3);
  }, [clearError, resetOtp]);

  const errorMessage = error?.message ?? submitError;

  const maskEmail = (email: string): string => {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const maskedLocal =
      local.length <= 2
        ? local[0] + '*'.repeat(local.length - 1)
        : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
  };

  // Step 1: Email + Password
  if (step === 'password') {
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

  // Step 2: OTP verification
  return (
    <form
      noValidate
      onSubmit={onSubmitOtp}
      className="space-y-5"
      aria-describedby={errorMessage ? 'otp-error' : undefined}
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong>{maskedEmail}</strong>. Enter it
          below to complete sign in.
        </p>
      </div>

      <OtpInput
        value={otpValue}
        onChange={(value) => setValueOtp('otp', value, { shouldValidate: true })}
        disabled={isLoading}
        autoFocus
        error={otpErrors.otp?.message}
        label="6-digit code"
      />

      {errorMessage && (
        <div
          id="otp-error"
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? 'Verifying…' : 'Verify code'}
        </Button>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBackToPassword}
            disabled={isLoading}
          >
            Back to password
          </Button>

          {resendCooldown > 0 ? (
            <span className="text-xs">
              Resend code in {resendCooldown}s
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResend}
              disabled={isLoading || resendRemaining <= 0}
            >
              Resend code
            </Button>
          )}

          {resendRemaining <= 0 && resendCooldown === 0 && (
            <span className="text-xs text-amber-400">
              Resend limit reached
            </span>
          )}
        </div>
      </div>
    </form>
  );
}