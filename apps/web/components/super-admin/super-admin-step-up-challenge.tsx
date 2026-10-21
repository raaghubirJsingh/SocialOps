'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/use-session';
import {
  adminStepUpChallenge,
  adminStepUpVerify,
  adminStepUpResend,
} from '@/lib/auth-client';
import type { AdminStepUpVerifyResponse } from '@/types/auth';

/**
 * Super Admin Step-Up OTP challenge form.
 *
 * Flow:
 * 1. On mount, auto-issue challenge (POST /admin/step-up/challenge)
 * 2. User enters 6-digit OTP
 * 3. On verify success, save sessionToken and redirect to /super-admin
 * 4. Resend button available (max 3 times)
 */
const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
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

export function SuperAdminStepUpChallenge() {
  const router = useRouter();
  const { session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sent' | 'unavailable' | 'loading'>('idle');
  const [resendRemaining, setResendRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpFormValues>({
    resolver: otpResolver,
    mode: 'onBlur',
    defaultValues: { otp: '' },
  });

  // Auto-issue challenge on mount
  useEffect(() => {
    issueChallenge();
  }, []);

  // Countdown timer for lock
  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c && c > 1) return c - 1;
        setRetryAfter(null);
        return null;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const issueChallenge = useCallback(async () => {
    setError(null);
    setSendStatus('loading');
    try {
      const result = await adminStepUpChallenge({ channel: 'EMAIL' });
      setSendStatus(result.sendStatus);
      if (result.sendStatus === 'sent') {
        setResendRemaining(3);
      }
    } catch {
      setSendStatus('unavailable');
      setError('Failed to send OTP. Please try again.');
    }
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setIsLoading(true);
    try {
      const result: AdminStepUpVerifyResponse = await adminStepUpVerify({
        channel: 'EMAIL',
        otp: values.otp,
      });

      if (result.outcome === 'verified') {
        // Store sessionToken in localStorage for the admin session
        const adminSession = {
          sessionToken: result.sessionToken,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        };
        localStorage.setItem('socialops.superAdminSession', JSON.stringify(adminSession));

        router.push('/super-admin');
        router.refresh();
      } else if (result.outcome === 'locked') {
        setError(`Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`);
        setRetryAfter(result.retryAfterSeconds);
        setCountdown(result.retryAfterSeconds);
      } else {
        setError('Invalid code. Please try again.');
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleResend = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await adminStepUpResend({ channel: 'EMAIL' });
      setSendStatus(result.sendStatus);
      setResendRemaining(result.resendRemaining);
    } catch {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="space-y-5 mt-6">
      <div className="rounded-lg border border-blue-900/50 bg-blue-950/30 p-3 text-sm text-slate-300">
        A 6-digit code has been sent to your email. Check your inbox (and spam folder).
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="otp">6-Digit Code</Label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            aria-invalid={errors.otp ? 'true' : undefined}
            aria-describedby={errors.otp ? 'otp-error' : undefined}
            disabled={isLoading || retryAfter !== null}
            {...register('otp')}
            className="text-center text-2xl tracking-widest"
          />
          {errors.otp && (
            <p id="otp-error" className="text-xs text-red-400">
              {errors.otp.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || retryAfter !== null}
        >
          {isLoading ? 'Verifying…' : retryAfter ? `Locked ({retryAfter}s)` : 'Verify & Continue'}
        </Button>

        {sendStatus === 'sent' && (
          <div className="text-center text-sm text-slate-400">
            <p>Code sent successfully.</p>
            {resendRemaining !== null && resendRemaining > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={handleResend}
                disabled={isLoading}
              >
                Resend code ({resendRemaining} remaining)
              </Button>
            )}
          </div>
        )}

        {sendStatus === 'unavailable' && (
          <p className="text-center text-sm text-amber-400">
            Email provider unavailable. Check server logs for the OTP (dev mode).
          </p>
        )}
      </form>
    </div>
  );
}