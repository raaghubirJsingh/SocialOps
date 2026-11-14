'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPhoneInput } from '@/components/shared/user-phone-input';
import { normalizeSelectedUserPhone } from '@/lib/user-phone';
import { ApiError } from '@/lib/api';
import {
  resendRegistrationOtp,
  setRegistrationPassword,
  verifyRegistrationOtp,
} from '@/lib/auth-client';
import {
  createRegistrationSessionFromStart,
  applyOtpResendResponse,
  applyOtpVerifyResponse,
  isOtpVerifyResponse,
} from '@/lib/registration-verification';
import type { RegistrationSession, RegistrationStartResponse } from '@/types/auth';
interface SimpleRegistrationFormProps {
  accountType: 'CLIENT' | 'SERVICE_PROVIDER';
  title: string;
  description: string;
  onSubmitStart: (values: {
    fullName: string;
    email: string;
    phone: { country: string; number: string };
    clientType?: 'INDIVIDUAL' | 'BUSINESS' | null;
    organizationName?: string;
    password: string;
  }) => Promise<RegistrationStartResponse>;
}

export function SimpleRegistrationForm({
  accountType,
  title,
  description,
  onSubmitStart,
}: SimpleRegistrationFormProps) {
  const router = useRouter();
  const [session, setSession] = useState<RegistrationSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z
    .object({
      fullName: z.string().min(1, 'Full name is required').max(200),
      email: z.string().min(1, 'Email is required').email('Invalid email format'),
      phoneCountry: z.string().min(1, 'Select a country'),
      phone: z.string().trim().min(1, 'Mobile number is required').max(50),
      clientType: z.enum(['INDIVIDUAL', 'BUSINESS']).optional().nullable(),
      organizationName: accountType === 'SERVICE_PROVIDER'
        ? z.string().min(1, 'Organization name is required').max(200)
        : z.string().optional(),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
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

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>();

  const [otpInputs, setOtpInputs] = useState<{ email: string; whatsapp: string }>({
    email: '',
    whatsapp: '',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleStart = async (data: FormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await onSubmitStart({
        fullName: data.fullName,
        email: data.email,
        phone: { country: data.phoneCountry, number: data.phone },
        clientType: data.clientType ?? null,
        organizationName: data.organizationName,
        password: data.password,
      });
      setSession(createRegistrationSessionFromStart(response));
    } catch (err: any) {
      setError(err?.body?.message ?? err?.message ?? 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  const verifyChannel = async (channel: 'EMAIL' | 'WHATSAPP') => {
    if (!session) return;
    const key = channel === 'EMAIL' ? 'email' : 'whatsapp';
    const otp = otpInputs[key];
    if (!otp || otp.length < 6) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await verifyRegistrationOtp({
        resumeToken: session.resumeToken,
        channel,
        otp,
      });
      if (isOtpVerifyResponse(res)) {
        const updated = applyOtpVerifyResponse(session, res);
        setSession(updated.session);
      }
    } catch (err: any) {
      setError(err?.body?.message ?? 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const resendChannel = async (channel: 'EMAIL' | 'WHATSAPP') => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await resendRegistrationOtp({
        resumeToken: session.resumeToken,
        channel,
      });
      setSession(applyOtpResendResponse(session, res));
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  const submitPassword = async () => {
    if (!session) return;
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPasswordError(null);
    try {
      await setRegistrationPassword({
        resumeToken: session.resumeToken,
        password,
        accountType,
      });
      router.push('/login');
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };
if (!session) {
    return (
      <form className="space-y-4" onSubmit={handleSubmit(handleStart)}>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" placeholder="Your full name" disabled={isLoading} {...register('fullName')} />
          {errors.fullName && <p className="text-xs text-red-400">{errors.fullName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" placeholder="you@example.com" disabled={isLoading} {...register('email')} />
          {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
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
                  idPrefix="simple-reg-phone"
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

        {accountType === 'CLIENT' && (
          <div className="space-y-1.5">
            <Label htmlFor="clientType">Account persona (optional)</Label>
            <select
              id="clientType"
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              disabled={isLoading}
              {...register('clientType')}
            >
              <option value="">Select persona (optional)</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
            </select>
          </div>
        )}

        {accountType === 'SERVICE_PROVIDER' && (
          <div className="space-y-1.5">
            <Label htmlFor="organizationName">Organization name</Label>
            <Input id="organizationName" placeholder="Your agency name" disabled={isLoading} {...register('organizationName')} />
            {errors.organizationName && <p className="text-xs text-red-400">{errors.organizationName.message}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="At least 8 characters" disabled={isLoading} {...register('password')} />
          {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" type="password" placeholder="Re-enter password" disabled={isLoading} {...register('confirmPassword')} />
          {errors.confirmPassword && <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>}
        </div>

        {error && <div role="alert" className="rounded-lg bg-red-950/35 px-3 py-2 text-xs text-red-300">{error}</div>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Starting verification…' : 'Continue to verification'}
        </Button>
      </form>
    );
  }
if (session.stage === 'verification') {
    const channels = [
      { id: 'EMAIL' as const, label: 'Email verification', contact: session.maskedEmail, verified: session.emailVerified, remaining: session.resendRemaining.email },
      { id: 'WHATSAPP' as const, label: 'WhatsApp verification', contact: session.maskedPhone, verified: session.whatsappVerified, remaining: session.resendRemaining.whatsapp },
    ];

    return (
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg bg-red-950/35 px-3 py-2 text-xs text-red-300">{error}</div>}
        {channels.map((ch) => (
          <div key={ch.id} className="surface-panel space-y-2 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-100">{ch.label}</span>
              <span className={ch.verified ? 'text-emerald-300' : 'text-slate-400'}>{ch.verified ? 'Verified ✓' : 'Pending'}</span>
            </div>
            <p className="text-xs text-slate-500">{ch.contact}</p>
            {!ch.verified && (
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`${ch.label} OTP`}
                  value={otpInputs[ch.id === 'EMAIL' ? 'email' : 'whatsapp']}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit OTP"
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpInputs((prev) => ({ ...prev, [ch.id === 'EMAIL' ? 'email' : 'whatsapp']: val }));
                  }}
                />
                <Button type="button" disabled={isLoading} onClick={() => void verifyChannel(ch.id)}>Verify</Button>
              </div>
            )}
            {!ch.verified && (
              <Button type="button" variant="ghost" size="sm" disabled={isLoading || ch.remaining <= 0} onClick={() => void resendChannel(ch.id)}>
                Resend ({ch.remaining} left)
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="rounded-lg bg-red-950/35 px-3 py-2 text-xs text-red-300">{error}</div>}
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">Create password</Label>
        <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-confirm">Confirm password</Label>
        <Input id="reg-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
      </div>
      {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
      <Button type="button" className="w-full" disabled={isLoading} onClick={() => void submitPassword()}>
        {isLoading ? 'Creating account…' : 'Create account'}
      </Button>
    </div>
  );
}
