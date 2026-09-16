'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { clientApi } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import type { InvitationResolution } from '@/types/client';

/**
 * Shared shell for every state of this page - loading, error, ready and the
 * Suspense fallback. It is defined once here rather than repeating the ambient
 * backdrop in four branches, so each state renders on the identical background
 * and there is no flash between them. Matches the login/register auth shell and
 * the APP-SIDE BLUR BUDGET in globals.css (one glass surface per screen).
 */
function InvitationShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
      </div>
      {children}
    </div>
  );
}

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
      <InvitationShell>
        <p className="relative text-sm text-slate-400">Loading invitation...</p>
      </InvitationShell>
    );
  }

  if (error) {
    return (
      <InvitationShell>
        <div className="relative w-full max-w-sm space-y-4 text-center">
          <div
            role="alert"
            className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
          <Link
            href="/"
            className="inline-block rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Return home
          </Link>
        </div>
      </InvitationShell>
    );
  }

  if (!invitation) return null;

  return (
    <InvitationShell>
      <div className="relative w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Social<span className="text-blue-400">Ops</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Client Invitation</p>
        </div>

        {/* The single glass surface for this page (APP-SIDE BLUR BUDGET). */}
        <div className="surface-glass space-y-4 rounded-2xl p-6">
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
              <Button asChild className="w-full">
                <Link
                  href={`/login?returnTo=/accept-invitation?token=${token}`}
                >
                  Sign in to Accept
                </Link>
              </Button>
              <p className="text-center text-xs text-slate-400">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="rounded text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  Register
                </Link>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Invitation links are single-use and expire after the expiration time.
        </p>
      </div>
    </InvitationShell>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <InvitationShell>
          <p className="relative text-sm text-slate-400">
            Loading invitation...
          </p>
        </InvitationShell>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}
