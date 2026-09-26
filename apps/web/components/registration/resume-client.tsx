'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { RegistrationFlow } from '@/components/registration/registration-flow';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { resumeRegistration } from '@/lib/auth-client';
import type { RegistrationResumeSnapshot } from '@/types/auth';

/**
 * Resume-registration client (Registration Phase v1.0 / OPEN-1/OPEN-6A).
 *
 * Consumes the emailed secure resume link token, validates it through
 * POST /api/auth/registration/resume, and re-enters the conversational
 * flow at the correct stage. The resumeToken is a stage credential only:
 * it creates NO session, and an invalid/expired/rotated token yields the
 * uniform 404 (the user is told to start a new registration).
 */
export function ResumeClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [snapshot, setSnapshot] = useState<RegistrationResumeSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired' | 'error'>(
    token ? 'loading' : 'expired',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await resumeRegistration({ resumeToken: token });
        if (cancelled) return;
        setSnapshot(result);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? 'expired' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (state !== 'ready' || !snapshot) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          यह resume link अब मान्य नहीं है। (This resume link is no longer
          valid — the registration may have expired or been completed.)
        </p>
        <Button asChild className="w-full">
          <Link href="/register">नई registration शुरू करें (Start again)</Link>
        </Button>
      </div>
    );
  }

  return <RegistrationFlow initialResume={{ token, snapshot }} />;
}