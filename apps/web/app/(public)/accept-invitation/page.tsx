'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import type { InvitationResolution } from '@/types/client';

/**
 * Public invitation acceptance page.
 * Token resolution is public; acceptance requires authentication.
 */
function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState<InvitationResolution | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : 'Invalid invitation link: missing token.',
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    const resolve = async () => {
      try {
        const result = await clientApi.resolveInvitation(token);
        setInvitation(result);
      } catch {
        setError('This invitation link is invalid or has expired.');
      } finally {
        setIsLoading(false);
      }
    };

    resolve();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    try {
      setIsAccepting(true);
      setError(null);
      const result = await clientApi.acceptInvitation(token);
      router.push(`/verify-mobile?clientId=${result.clientId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to accept invitation.';
      setError(message);
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="text-sm text-slate-400">Loading invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Link href="/" className="mt-4 inline-block text-blue-400 hover:underline">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Social<span className="text-blue-400">Ops</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Client Invitation</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-400">Client</p>
            <p className="text-lg font-medium text-slate-100">
              {invitation.clientName}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Email</p>
            <p className="text-slate-100">{invitation.email}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Expires</p>
            <p className="text-slate-100">
              {new Date(invitation.expiresAt).toLocaleString()}
            </p>
          </div>

          {isAuthenticated ? (
            <Button
              className="w-full"
              onClick={handleAccept}
              disabled={isAccepting}
            >
              {isAccepting ? 'Accepting...' : 'Accept Invitation'}
            </Button>
          ) : (
            <div className="space-y-2">
              <Link href={`/login?returnTo=/accept-invitation?token=${token}`}>
                <Button className="w-full">Sign in to Accept</Button>
              </Link>
              <p className="text-center text-xs text-slate-500">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-blue-400 hover:underline">
                  Register
                </Link>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          Invitation links are single-use and expire after the expiration time.
        </p>
      </div>
    </div>
    );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="text-sm text-slate-400">Loading invitation...</p>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}
