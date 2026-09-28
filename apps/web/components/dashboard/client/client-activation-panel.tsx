'use client';

import { useState, type FormEvent } from 'react';
import { Lock, ScrollText, ShieldCheck } from 'lucide-react';

import { ClientOverview } from '@/components/dashboard/client/client-overview';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMyClient } from '@/hooks/use-client-overview';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import { saveBoundClientId } from '@/lib/client-session';
import {
  CLIENT_TERMS_ACKNOWLEDGEMENT,
  CLIENT_TERMS_SECTIONS,
  CLIENT_TERMS_TITLE,
} from '@/lib/client-terms';
import type { ClientType } from '@/types/client';

interface ClientActivationPanelProps {
  onActivated: () => void;
  /** True when a persisted binding exists but is still PENDING. */
  pending?: boolean;
}

/**
 * Turn an activation failure into text the client can actually act on.
 *
 * The server is the authority on WHY activation failed: it returns a
 * self-describing body (`message` for the human, `detail`/`code` for
 * diagnostics, plus a `missing` field naming the absent column). We show
 * those words verbatim inside the T&C modal instead of replacing them with
 * a generic banner, so a real "missing: clientType" reads as such instead
 * of a misleading "please complete your profile".
 *
 * The per-status fallbacks only apply when the server sent nothing usable
 * (e.g. a proxy or gateway error), so they never mask a real explanation.
 */
function activationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body =
      err.body && typeof err.body === 'object'
        ? (err.body as {
            message?: unknown;
            detail?: unknown;
            error?: unknown;
          })
        : null;

    for (const key of ['message', 'detail', 'error'] as const) {
      const value = body?.[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    switch (err.status) {
      case 409:
        return 'A client profile is already linked to your account. Refresh the page to continue.';
      case 400:
        return 'The activation request was rejected as incomplete. Please try again.';
      case 403:
        return 'Activation is not available for this account yet. Your email must be verified first.';
      default:
        return err.message || 'Unable to activate your workspace. Please try again.';
    }
  }
  return 'Unable to activate your workspace. Please try again.';
}

/**
 * Read the server's machine-readable reason for a failed activation.
 *
 * The backend names the exact account field it could not read
 * (`missing: 'clientType' | 'phone' | ...`). We use that to ask the ONE
 * question the account can no longer answer for itself, instead of leaving
 * the user with a dead end.
 */
function activationMissingField(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body;
  if (!body || typeof body !== 'object') return null;
  const missing = (body as { missing?: unknown }).missing;
  return typeof missing === 'string' && missing.length > 0 ? missing : null;
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
  // Set when the server reports it cannot read the persona from the
  // account record. Accounts created before the persona was captured at
  // registration have no recoverable source for it (their pending
  // registration row is deleted on completion), so we ask the user once,
  // here, and the server persists the answer to their own account.
  const [personaRequired, setPersonaRequired] = useState(false);
  const [persona, setPersona] = useState<ClientType | ''>('');

  /**
   * Welcome T&C gate.
   *
   * The dialog opens automatically the moment a PENDING self-registered
   * client reaches this screen - there is no path to a workspace that
   * skips it, and it cannot be dismissed by Escape or a backdrop click
   * (`dismissible={false}`). The agreement checkbox gates the button in
   * the UI only: activation itself is still decided server-side, and the
   * client is still PENDING until the backend transitions it, so
   * "permanently disappears" is driven by real state, not by local
   * storage.
   */
  const [termsOpen, setTermsOpen] = useState(true);
  const [agreed, setAgreed] = useState(false);

  /**
   * 1-Click activation: no intake, no form, no second OTP.
   *
   * `type` is sent ONLY when the account has to answer the persona
   * question itself (see `personaRequired`). It is a declaration about
   * the signed-in user's own workspace - never an identifier, and never
   * used to reach another account; the server binds everything to the JWT
   * subject and re-reads its own record.
   */
  const handleActivate = async () => {
    if (loading || !agreed) return;
    if (personaRequired && !persona) return;
    setLoading(true);
    setError(null);
    try {
      const response = await clientApi.startOnboarding(
        personaRequired && persona ? { type: persona } : {},
      );
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
      if (activationMissingField(err) === 'clientType') {
        // The account has no persona on record and none we can derive.
        // Ask for it once, here, instead of failing again on retry.
        setPersonaRequired(true);
      }
      setError(activationErrorMessage(err));
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
          <Button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="h-11 w-full rounded-xl hover:-translate-y-1"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Review Terms &amp; Activate
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

      {/*
        Welcome T&C Acceptance gate.

        Mandatory: `dismissible={false}` removes the Escape handler, the
        backdrop click and the default Close button, so a PENDING client
        cannot reach a workspace without agreeing. The button stays
        disabled until the checkbox is ticked, and the click performs the
        1-Click activation (POST /onboarding/start) with no secondary
        verification.

        The legal copy lives in `lib/client-terms.ts` so the wording can be
        revised in exactly one place.
      */}
      <Dialog
        open={termsOpen}
        dismissible={false}
        onClose={() => setTermsOpen(false)}
        title={CLIENT_TERMS_TITLE}
        description="Please review these terms before activating your workspace. They govern how your data and content are handled."
        footer={
          <Button
            type="button"
            disabled={!agreed || loading || (personaRequired && !persona)}
            onClick={() => {
              void handleActivate();
            }}
            className="h-11 rounded-xl px-6 hover:-translate-y-1"
          >
            {loading ? 'Activating…' : 'I Agree & Activate Workspace'}
          </Button>
        }
      >
        <div className="space-y-4">
          {personaRequired && (
            <fieldset className="surface-panel rounded-xl p-4">
              <legend className="px-1 text-sm font-semibold text-slate-100">
                What kind of workspace is this?
              </legend>
              <p className="text-xs leading-relaxed text-slate-400">
                We could not find this on your account, so please pick one. We
                only ask once.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'INDIVIDUAL', label: 'Individual' },
                    { value: 'BUSINESS', label: 'Business' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-200 ' +
                      (persona === opt.value
                        ? 'border-blue-500/60 bg-blue-500/[0.08] text-slate-100'
                        : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-slate-600')
                    }
                  >
                    <input
                      type="radio"
                      name="activation-persona"
                      value={opt.value}
                      checked={persona === opt.value}
                      onChange={() => setPersona(opt.value)}
                      className="accent-blue-500"
                      disabled={loading}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {CLIENT_TERMS_SECTIONS.map((section) => (
            <section key={section.id} className="surface-panel rounded-xl p-4">
              <h4 className="text-sm font-semibold text-slate-100">
                {section.heading}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                {section.body}
              </p>
            </section>
          ))}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/[0.12] bg-white/[0.04] accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={loading}
            />
            {CLIENT_TERMS_ACKNOWLEDGEMENT}
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>
      </Dialog>
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