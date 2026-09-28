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

interface ClientActivationPanelProps {
  onActivated: () => void;
  /** True when a persisted binding exists but is still PENDING. */
  pending?: boolean;
}

/**
 * ClientActivationPanel — the ONE-CLICK activation for self-registered
 * clients, embedded on the dashboard (this replaces the old multi-page
 * onboarding path as the primary flow).
 *
 * 1-Click Activation: Registration Phase v1.0 already verified BOTH the
 * email and the WhatsApp number BEFORE this account was created. The
 * panel therefore collects NOTHING — there is no name, email, phone or
 * account-type input — and simply asks the backend to activate the
 * workspace, which it does from the authenticated User record. A second
 * mobile OTP would only re-prove a number we already proved, so it is
 * bypassed server-side for these accounts.
 *
 * Governance notes:
 *   - Identity is displayed from the session, never editable and never
 *     submitted as a change.
 *   - The button is a deliberate, explicit user action rather than an
 *     auto-fire on mount: activation is a state-changing POST, and firing
 *     it from a render would re-run on every refresh and React Strict
 *     Mode double-invoke, producing spurious errors.
 *   - The code field below is NOT part of the normal flow. It only appears
 *     when the backend reports `mobileVerificationRequired` — the legacy
 *     fallback for accounts that predate dual registration verification.
 *   - The activation panel is this screen's ONE glass surface (APP-SIDE
 *     BLUR BUDGET, globals.css).
 */
export function ClientActivationPanel({
  onActivated,
  pending = false,
}: ClientActivationPanelProps) {
  const { session } = useSession();
  const [token, setToken] = useState('');
  const [codeRequired, setCodeRequired] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 1-Click activation: no payload, no form, no second OTP. */
  const handleActivate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await clientApi.startOnboarding({});
      // Persist the binding hint NOW so a refresh cannot lose the state
      // (the backend keeps the client PENDING until the code is used).
      saveBoundClientId(response.clientId);
      if (response.mobileVerificationRequired) {
        // Legacy fallback: this account predates dual registration
        // verification, so it still has to prove the number itself.
        setCodeRequired(true);
        setCodeExpiresAt(response.mobileVerificationExpiresAt);
        return;
      }
      onActivated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          'A client profile is already linked to your account. Refresh the page to continue.',
        );
      } else if (err instanceof ApiError && err.status === 400) {
        setError(
          'We could not activate automatically. Please complete your profile first.',
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setError(
          'Activation is not available for this account yet. Your email must be verified first.',
        );
      } else {
        setError('Unable to activate your workspace. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Legacy fallback only: consume the issued mobile verification code. */
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
          ? 'Your activation is pending. One click unlocks your client workspace.'
          : 'One click unlocks your client workspace — social accounts, content and profile. We use the details you already verified at registration.'}
      </p>

      {/* Identity — strictly read-only, displayed from the session only. */}
      <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-xs font-medium text-slate-400">Activated as</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
          <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          {session?.user.fullName ?? '—'}
          <span className="text-slate-500">·</span>
          {session?.email ?? '—'}
          <span className="text-xs text-slate-500">
            Verified at sign-up — cannot be changed
          </span>
        </p>
      </div>
      {!codeRequired ? (
        <div className="mt-5 space-y-4">
          <Button type="button" onClick={handleActivate} disabled={loading}>
            {loading ? 'Activating…' : 'Activate My Workspace'}
          </Button>
          <p className="text-xs text-slate-500">
            Uses the name, email and mobile number already verified when you
            registered — nothing else to fill in.
          </p>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleVerifySubmit} className="mt-5 space-y-4">
          <p className="text-xs text-slate-400">
            This account was created before registration verified your mobile
            number, so we need to confirm it once before activating.
          </p>
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
            {codeExpiresAt ? (
              <p className="text-xs text-slate-500">
                Code expires {new Date(codeExpiresAt).toLocaleTimeString()}.
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