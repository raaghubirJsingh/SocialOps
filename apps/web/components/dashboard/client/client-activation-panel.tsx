'use client';

import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

import { ClientOverview } from '@/components/dashboard/client/client-overview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMyClient } from '@/hooks/use-client-overview';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import { saveBoundClientId } from '@/lib/client-session';
import type { StartOnboardingResponse } from '@/types/client';

type ClientTypeChoice = '' | 'INDIVIDUAL' | 'BUSINESS';

interface ClientActivationPanelProps {
  onActivated: () => void;
  /** True when a persisted binding exists but is still PENDING. */
  pending?: boolean;
}

/** Simple phone sanity check; the backend stays the real authority. */
function isPhoneValid(value: string): boolean {
  return /^[+()\d][\d\s()+-]{6,19}$/.test(value.trim());
}

/**
 * ClientActivationPanel — the ONE-TIME mobile-verification activation for
 * self-registered clients, embedded on the dashboard (human decision: this
 * replaces the old multi-page onboarding path as the primary flow).
 *
 * Governance notes:
 *   - Email is verified at sign-up and is strictly READ-ONLY here — it is
 *     displayed from the session, never editable, and never sent as a change.
 *   - Name is editable and pre-filled from the session.
 *   - Phone is REQUIRED (validated before submit) — the backend contract
 *     needs `directPhone` to issue the verification code.
 *   - Account Type (Individual/Business) is STRICTLY REQUIRED: the code is
 *     never sent until a choice is made, and an inline error is shown.
 *   - No backend change: uses the existing start + activate endpoints. A
 *     retry may create another PENDING row (accepted backend behavior).
 *   - The activation panel is this screen's ONE glass surface (APP-SIDE
 *     BLUR BUDGET, globals.css).
 */
export function ClientActivationPanel({
  onActivated,
  pending = false,
}: ClientActivationPanelProps) {
  const { session } = useSession();
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [type, setType] = useState<ClientTypeChoice>('');
  const [name, setName] = useState(session?.user.fullName ?? '');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [started, setStarted] = useState<StartOnboardingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleDetailsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !session) return;
    if (type === '') {
      setError('Account type is strictly required — choose Individual or Business.');
      return;
    }
    if (name.trim().length === 0) return;
    if (!isPhoneValid(phone)) {
      setPhoneError('Phone is required — enter a valid mobile number.');
      return;
    }
    setPhoneError(null);
    setError(null);
    setLoading(true);
    try {
      const response = await clientApi.startOnboarding({
        type,
        name: name.trim(),
        directEmail: session.email,
        directPhone: phone.trim(),
      });
      // Persist the binding hint NOW so a refresh cannot lose the pending
      // state (the backend keeps the client PENDING until the code is used).
      saveBoundClientId(response.clientId);
      setStarted(response);
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          'A client profile is already linked to your account. Refresh the page to continue.',
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setError(
          'Activation is not available for this account yet. Your email must be verified first.',
        );
      } else {
        setError('Unable to send the verification code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !token.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const client = await clientApi.activateOnboarding({ token: token.trim() });
      saveBoundClientId(client.id);
      onActivated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('This code is invalid, has already been used, or has expired.');
      } else {
        setError('Unable to verify the code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-glass rounded-xl p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-400" aria-hidden="true" />
        <h2 className="text-xl font-semibold tracking-tight text-slate-100">
          Activate your account
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {pending
          ? 'Your activation is pending. Verify your mobile number to unlock your client workspace.'
          : 'One-time mobile verification unlocks your client workspace — social accounts, content and profile.'}
      </p>

      {/* Email — strictly read-only (verified at sign-up; never changeable). */}
      <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-xs font-medium text-slate-400">Email</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
          <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          {session?.email ?? '—'}
          <span className="text-xs text-slate-500">
            Verified at sign-up — cannot be changed
          </span>
        </p>
      </div>
      {step === 'details' ? (
        <form onSubmit={handleDetailsSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="activation-name" className="text-sm text-slate-300">
              Full name
            </Label>
            <Input
              id="activation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={loading}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm text-slate-300">Client type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['INDIVIDUAL', 'BUSINESS'] as const).map((value) => (
                <label
                  key={value}
                  className={
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-200 ' +
                    (type === value
                      ? 'border-blue-500/60 bg-blue-500/[0.08] text-slate-100'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-slate-600')
                  }
                >
                  <input
                    type="radio"
                    name="activation-client-type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="accent-blue-500"
                    disabled={loading}
                  />
                  {value === 'INDIVIDUAL' ? 'Individual' : 'Business'}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label
              htmlFor="activation-phone"
              className="text-sm text-slate-300"
            >
              Phone <span className="text-red-400">*</span>{' '}
              <span className="text-xs font-normal text-slate-500">
                (required)
              </span>
            </Label>
            <Input
              id="activation-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              placeholder="e.g. +91 98765 43210"
              autoComplete="tel"
              aria-invalid={Boolean(phoneError)}
              disabled={loading}
            />
            {phoneError ? (
              <p className="text-xs text-red-400">{phoneError}</p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={
              loading ||
              type === '' ||
              name.trim().length === 0 ||
              !isPhoneValid(phone)
            }
          >
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifySubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="activation-token"
              className="text-sm text-slate-300"
            >
              Verification code
            </Label>
            <Input
              id="activation-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="e.g. 123456"
              autoComplete="one-time-code"
              disabled={loading}
            />
            {started?.mobileVerificationExpiresAt ? (
              <p className="text-xs text-slate-500">
                Code expires{' '}
                {new Date(started.mobileVerificationExpiresAt).toLocaleTimeString()}.
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" disabled={loading || !token.trim()}>
            {loading ? 'Verifying…' : 'Verify & activate'}
          </Button>
        </form>
      )}
    </section>
  );
}

/**
 * Decides what the client persona sees on the dashboard:
 *   - persisted binding + 200 → the normal overview;
 *   - persisted binding + 403 → the caller's own PENDING onboarding
 *     (operational access is denied until activation completes) → the
 *     activation panel, never a dead end;
 *   - no binding at all → the dashboard renders the activation panel
 *     directly (handled by the page).
 */
export function ClientPersonaSurface({
  clientId,
  onActivated,
}: {
  clientId: string;
  onActivated: () => void;
}) {
  const clientQuery = useMyClient(clientId);

  if (clientQuery.isPending) {
    return (
      <section className="surface-panel rounded-xl p-6">
        <p className="text-sm text-slate-400">Loading your workspace…</p>
      </section>
    );
  }

  if (clientQuery.error) {
    return <ClientActivationPanel onActivated={onActivated} pending />;
  }

  return <ClientOverview clientId={clientId} />;
}