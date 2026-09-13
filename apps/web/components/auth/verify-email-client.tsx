'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resendVerification, verifyEmail } from '@/lib/auth-client';

/**
 * Email verification flow (client component for /verify-email).
 *
 * Two modes, driven by the `token` query parameter:
 *
 *  1. Token present (arrived from the verification link): the token is
 *     consumed exactly once via POST /api/auth/verify-email. The raw
 *     token is NEVER displayed in the UI - it only travels in the URL
 *     and the request body. Invalid, expired, and already-used tokens
 *     all produce the same generic backend error, which is rendered as
 *     one generic "link is invalid" message (no condition is leaked).
 *
 *  2. No token: the "check your inbox" state with the generic resend
 *     option. The resend response is identical regardless of account
 *     state, so the UI shows one neutral confirmation message and never
 *     infers whether the address exists or is already verified.
 *
 * The form follows the workspace convention: React Hook Form + a Zod
 * schema, hand-rolled resolver (same rationale as login-form.tsx -
 * avoids pinning @hookform/resolvers against the hoisted Zod 4).
 */

const resendSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
});

type ResendFormValues = z.infer<typeof resendSchema>;

const resendResolver: Resolver<ResendFormValues> = async (raw) => {
  const result = resendSchema.safeParse(raw);
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

type VerificationState =
  | { phase: 'verifying' }
  | { phase: 'verified' }
  | { phase: 'invalid' };

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // `status=sent` is the signal the registration form sets when it
  // navigates to /verify-email after a successful POST /api/auth/register
  // (plan instruction §16). The pre-filled `email` query parameter is
  // the same email the backend just registered, so the resend form is
  // already populated and the user does not have to retype it. The
  // raw verification token never appears as a query parameter or in
  // any visible UI element.
  const status = searchParams.get('status');
  const prefillEmail = searchParams.get('email') ?? '';

  const [state, setState] = useState<VerificationState | null>(
    token ? { phase: 'verifying' } : null,
  );
  const [resendQueued, setResendQueued] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  // Consume the token exactly once, even under React strict-mode
  // double-invocation of effects in development.
  const consumedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (consumedTokenRef.current === token) return;
    consumedTokenRef.current = token;

    let cancelled = false;
    setState({ phase: 'verifying' });
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState({ phase: 'verified' });
      })
      .catch(() => {
        // Generic error only: invalid, expired, and consumed tokens are
        // indistinguishable by contract - do not leak which occurred.
        if (!cancelled) setState({ phase: 'invalid' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendFormValues>({
    resolver: resendResolver,
    mode: 'onBlur',
    defaultValues: { email: prefillEmail },
  });

  const onResend = handleSubmit(async (values) => {
    setResendError(null);
    try {
      await resendVerification(values.email);
      // Generic confirmation - the backend response is identical for
      // unknown, already-verified, and queued addresses.
      setResendQueued(true);
    } catch {
      setResendError(
        'Unable to process the request right now. Please try again.',
      );
    }
  });

  const showResendForm = !token || state?.phase === 'invalid';
  // The "we just sent it" view is shown when the registration form
  // navigates here (status=sent) without a token. A direct visit with
  // no token and no status still shows the same resend form, which is
  // a safe default.
  const justSent = status === 'sent' && !token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-bold tracking-tight"
          >
            Social<span className="text-blue-400">Ops</span>
          </Link>
          <p className="mt-2 text-sm text-slate-400">Email verification</p>
        </div>

        {state?.phase === 'verifying' && (
          <p className="text-center text-sm text-slate-400">
            Verifying your email…
          </p>
        )}

        {state?.phase === 'verified' && (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-semibold">Email verified</h2>
            <p className="text-sm text-slate-400">
              Your email address has been verified. You can now sign in
              to SocialOps.
            </p>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Sign in
            </Link>
          </div>
        )}

        {state?.phase === 'invalid' && (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
            >
              This verification link is invalid or has expired. Request a
              new verification email below.
            </div>
            <ResendForm
              register={register}
              errors={errors}
              isSubmitting={isSubmitting}
              onSubmit={onResend}
              queued={resendQueued}
              resendError={resendError}
            />
          </div>
        )}

        {showResendForm && !state && (
          <div className="space-y-4">
            <h2 className="text-center text-xl font-semibold">
              {justSent ? 'Check your inbox' : 'Verify your email'}
            </h2>
            <p className="text-center text-sm text-slate-400">
              {justSent
                ? 'A verification email is on its way. Use the link in the email to verify your address. Did not receive it? You can request a new one below.'
                : 'Enter the email address you registered with. If the account exists and is unverified, a new verification email will be queued.'}
            </p>
            <ResendForm
              register={register}
              errors={errors}
              isSubmitting={isSubmitting}
              onSubmit={onResend}
              queued={resendQueued}
              resendError={resendError}
            />
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Verification links are single-use and expire after 24 hours.
        </p>
      </div>
    </div>
  );
}

/**
 * Shared resend form. The confirmation is intentionally generic: the
 * backend answers {"status":"queued"} regardless of whether the email
 * exists or is already verified, and the UI must not enable email
 * enumeration.
 */
function ResendForm({
  register,
  errors,
  isSubmitting,
  onSubmit,
  queued,
  resendError,
}: {
  register: ReturnType<typeof useForm<ResendFormValues>>['register'];
  errors: ReturnType<typeof useForm<ResendFormValues>>['formState']['errors'];
  isSubmitting: boolean;
  onSubmit: () => void;
  queued: boolean;
  resendError: string | null;
}) {
  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'resend-email-error' : undefined}
          disabled={isSubmitting}
          {...register('email')}
        />
        {errors.email && (
          <p id="resend-email-error" className="text-xs text-red-400">
            {errors.email.message}
          </p>
        )}
      </div>
      {resendError && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {resendError}
        </div>
      )}
      {queued && !resendError && (
        <div
          role="status"
          className="rounded-md border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200"
        >
          If the address is registered and not yet verified, a new
          verification email has been queued.
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Resend verification email'}
      </Button>
    </form>
  );
}