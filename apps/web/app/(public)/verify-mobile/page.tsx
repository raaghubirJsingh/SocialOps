'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';

const verifyMobileSchema = z.object({
  token: z.string().min(16, 'Verification token is required').max(256),
});

type VerifyMobileFormValues = z.infer<typeof verifyMobileSchema>;

const verifyMobileResolver: Resolver<VerifyMobileFormValues> = async (raw) => {
  const result = verifyMobileSchema.safeParse(raw);
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
 * Mobile verification page (authenticated).
 * Requires JWT. The raw token is obtained from the server console log (dev only)
 * or via SMS (production - deferred).
 */
function VerifyMobileContent() {
  const router = useRouter();
  const { isAuthenticated } = useSession();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyMobileFormValues>({
    resolver: verifyMobileResolver,
    defaultValues: { token: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setIsLoading(true);
      setError(null);
      const client = await clientApi.activateOnboarding({ token: values.token });
      router.push(`/client?clientId=${client.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Verification failed.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  });

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="text-sm text-slate-400">
          Please sign in to verify your mobile number.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Social<span className="text-blue-400">Ops</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Verify Mobile Number</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">Verification Token</Label>
            <Input
              id="token"
              placeholder="Enter verification token"
              disabled={isLoading}
              {...register('token')}
            />
            {errors.token && (
              <p className="text-xs text-red-400">{errors.token.message}</p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Verifying...' : 'Verify'}
          </Button>
        </form>

        <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-400">
            <strong className="text-slate-300">Development note:</strong> The
            verification token is logged to the server console when{' '}
            <code className="text-slate-300">BOOT_ARTIFACTS_ALLOWED=true</code>.
            In production, it will be sent via SMS (deferred).
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyMobilePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    }>
      <VerifyMobileContent />
    </Suspense>
  );
}
