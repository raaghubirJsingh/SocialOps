'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import {
  resendRegistrationOtp,
  setRegistrationPassword,
  startRegistration,
  verifyRegistrationOtp,
} from '@/lib/auth-client';
import {
  FORCED_OPTIONS,
  FORCED_QUESTION,
  botMessageFor,
  createConversation,
  discoveryAnswersSnapshot,
  identityFieldFor,
  optionsFor,
  selectOption,
  submitIdentityField,
  type ConversationState,
} from '@/lib/registration-conversation';
import type {
  AccountType,
  OtpChannel,
  RegistrationResumeSnapshot,
  RegistrationStartResponse,
} from '@/types/auth';

/**
 * Registration Phase v1.0 conversational registration flow.
 *
 * Hybrid UI: conversational SocialOps messages + contextual option
 * buttons; free text only where genuinely necessary (name/phone/email
 * and OTP digits). Discovery runs through the PURE state machine in
 * `lib/registration-conversation.ts`; API stages use the staged
 * registration endpoints (resumeToken stage credential - never a
 * session; no tokens are ever issued here).
 *
 * Stages: discovery -> identity -> verification (dual OTP) -> password
 * -> created (/login). A resume entry (emailed link) rejoins at
 * verification/password, with the approved forced-choice step first if
 * classification was still unresolved (L13).
 */

type Stage =
  | 'discovery'
  | 'identity'
  | 'verification'
  | 'forced-choice'
  | 'password'
  | 'created';

/**
 * Stages that cannot proceed without a live resume credential.
 *
 * `identity` is deliberately absent: it runs BEFORE /start and is what
 * OBTAINS the resumeToken, so a null token there is the normal
 * pre-registration state. `discovery` needs no credential either.
 * Everything else (resume verification/password, and the forced choice on
 * an emailed resume link) is credential-gated.
 */
const RESUME_REQUIRED_STAGES: readonly Stage[] = [
  'forced-choice',
  'verification',
  'password',
];

interface Msg {
  role: 'bot' | 'user' | 'error';
  text: string;
}

export interface RegistrationFlowProps {
  initialResume?: {
    token: string;
    snapshot: RegistrationResumeSnapshot;
  };
}

function bodyOf(err: unknown): { message?: string; retryAfterSeconds?: number } {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    return err.body as { message?: string; retryAfterSeconds?: number };
  }
  return {};
}

function messageFromError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = bodyOf(err);
    if (err.status === 404) {
      return 'यह registration समाप्त हो चुका है — कृपया दोबारा शुरू करें। (This registration has expired or was completed. Please start again.)';
    }
    if (err.status === 429 && body.retryAfterSeconds) {
      return `Too many attempts — please wait ${body.retryAfterSeconds} seconds and try again.`;
    }
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.retryAfterSeconds
        ? `${body.message} (retry in ${body.retryAfterSeconds}s)`
        : body.message;
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

const EMAIL_OTP_HINT =
  'दोनों चैनल पर OTP भेज दिया गया है। Email और WhatsApp दोनों verify करना ज़रूरी है। (Sent to both channels — both verifications are mandatory.)';
const PASSWORD_PROMPT =
  'बहुत बढ़िया! अब अपना password बनाइए (कम से कम 8 characters)।';

export function RegistrationFlow({ initialResume }: RegistrationFlowProps) {
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversation(),
  );
  const [stage, setStage] = useState<Stage>(() => {
    if (!initialResume) return 'discovery';
    if (!initialResume.snapshot.accountType) return 'forced-choice';
    return initialResume.snapshot.stage === 'password' ? 'password' : 'verification';
  });
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (!initialResume) {
      return [{ role: 'bot', text: botMessageFor(createConversation()) }];
    }
    const s = initialResume.snapshot;
    const lines = [`आपका registration जारी है (${s.maskedEmail} / ${s.maskedPhone}).`];
    if (!s.accountType) lines.push(FORCED_QUESTION);
    else if (s.stage === 'verification') lines.push(EMAIL_OTP_HINT);
    else lines.push(PASSWORD_PROMPT);
    return lines.map((text) => ({ role: 'bot' as const, text }));
  });

  const [resumeToken, setResumeToken] = useState<string | null>(
    initialResume?.token ?? null,
  );
  const [startInfo, setStartInfo] = useState<RegistrationStartResponse | null>(null);
  const [snapshot, setSnapshot] = useState<RegistrationResumeSnapshot | null>(
    initialResume?.snapshot ?? null,
  );
  const [verified, setVerified] = useState({
    email: initialResume?.snapshot.emailVerified ?? false,
    whatsapp: initialResume?.snapshot.whatsappVerified ?? false,
  });
  const [classification, setClassification] = useState<AccountType | null>(
    initialResume?.snapshot.accountType ?? null,
  );

  // Identity wizard (Rule 7) is owned by the pure state machine; this
  // component only renders the single field for the current sub-step.
  const [identityError, setIdentityError] = useState<string | null>(null);
  /** Draft text for the one identity input currently on screen. */
  const [identityDraft, setIdentityDraft] = useState('');

  // Which identity field the state machine is asking for right now. The
  // draft is cleared at the moment the step advances (in the submit handler),
  // so a previous answer is never carried into the next input.
  const identitySubStep = identityFieldFor(conversation.stage);

  const [otpInputs, setOtpInputs] = useState<{ EMAIL: string; WHATSAPP: string }>({
    EMAIL: '',
    WHATSAPP: '',
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const transcriptRef = useRef<HTMLDivElement>(null);

  const push = useCallback((...msgs: Msg[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const lockSeconds =
    lockedUntil && lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
  // "Dead" = the staged registration cannot continue, because the resume
  // credential is gone (a 404 clears it in handleFailure) while the user
  // sits in a stage that requires it. Computed from the stages that DO
  // require a credential so the pre-registration identity wizard (the steps
  // asking "आपको किस नाम से बुलाऊँ?" etc.) keeps rendering instead of being
  // masked as a dead end.
  //
  // The identity wizard is deliberately NOT gated on `dead` at its render
  // block: those steps run BEFORE /start, so a null resumeToken is their
  // NORMAL state, and a stale credential must never suppress them.
  const dead = resumeToken === null && RESUME_REQUIRED_STAGES.includes(stage);

  // Single source of truth for "is the wizard asking for a field right now".
  // Derived from the PURE state machine (conversation.stage), not from the
  // local `stage`, which is presentation bookkeeping only and can disagree.
  const inIdentityWizard = identitySubStep !== null;

  function handleFailure(err: unknown): void {
    const body = bodyOf(err);
    if (err instanceof ApiError && err.status === 403 && body.retryAfterSeconds) {
      // Uses the state heartbeat clock (module-pure; no Date.now() here).
      setLockedUntil(now + body.retryAfterSeconds * 1000);
    }
    if (err instanceof ApiError && err.status === 404) {
      setResumeToken(null); // dead credential - restart required
    }
    push({ role: 'error', text: messageFromError(err) });
  }
  function chooseOption(id: string, label: string): void {
    push({ role: 'user', text: label });
    const next = selectOption(conversation, id);
    setConversation(next);
    if (next.stage !== conversation.stage) {
      if (next.stage === 'identity-name') setStage('identity');
      push({ role: 'bot', text: botMessageFor(next) });
    }
  }

  function chooseForcedClassification(value: AccountType, label: string): void {
    push({ role: 'user', text: label });
    setClassification(value);
    // The explicit forced choice (never guessed - L13) travels with the
    // password stage for resume flows, where the pending row started
    // with accountType = null.
    const target: Stage = snapshot?.stage === 'password' ? 'password' : 'verification';
    setStage(target);
    push({ role: 'bot', text: target === 'password' ? PASSWORD_PROMPT : EMAIL_OTP_HINT });
  }

  /**
   * Rule 7: one field at a time, in the approved order
   * name -> WhatsApp mobile -> email. Each accepted answer echoes into the
   * transcript and advances the pure state machine; the FINAL step
   * (email) re-validates all three and performs the single /start call that
   * obtains the resumeToken. The /start payload is unchanged.
   */
  async function submitIdentityFieldAndAdvance(value: string): Promise<void> {
    setIdentityError(null);
    const field = identityFieldFor(conversation.stage);
    if (!field) return;

    if (!value.trim()) {
      setIdentityError(
        field === 'fullName'
          ? 'कृपया अपना नाम लिखें। (Please enter your name.)'
          : field === 'phone'
            ? 'WhatsApp mobile number ज़रूरी है। (WhatsApp mobile is required.)'
            : 'सही email address डालें। (Enter a valid email address.)',
      );
      return;
    }
    if (field === 'email' && !/^\S+@\S+\.\S+$/.test(value.trim())) {
      setIdentityError('सही email address डालें। (Enter a valid email address.)');
      return;
    }

    // Blank values are rejected above, so this always advances.
    const next = submitIdentityField(conversation, value);
    if (next.stage === conversation.stage) return;

    push({ role: 'user', text: value.trim() });
    setConversation(next);
    // Clear the draft as the step advances so the next input starts empty.
    setIdentityDraft('');

    if (next.stage !== 'identity') {
      // Intermediate step: ask the next question.
      push({ role: 'bot', text: botMessageFor(next) });
      return;
    }
    await completeRegistration(next);
  }

  /** All three identity fields are in: classify-check, then POST /start once. */
  async function completeRegistration(state: ConversationState): Promise<void> {
    const { fullName, phone, email } = state;
    if (!fullName || !phone || !email) return; // defensive; wizard guarantees these
    if (!state.classification) {
      // Defensive: discovery always resolves classification before the
      // identity step; if it somehow does not, force the explicit choice.
      push({ role: 'bot', text: FORCED_QUESTION });
      setStage('forced-choice');
      return;
    }

    setBusy(true);
    try {
      const result = await startRegistration({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        accountType: state.classification,
        discoveryAnswers: discoveryAnswersSnapshot(state),
      });
      setResumeToken(result.resumeToken);
      setStartInfo(result);
      setStage('verification');
      push({ role: 'bot', text: EMAIL_OTP_HINT });
      const unavailable = [
        result.sendStatus.email === 'unavailable' ? 'Email' : null,
        result.sendStatus.whatsapp === 'unavailable' ? 'WhatsApp' : null,
      ].filter((v): v is string => v !== null);
      if (unavailable.length > 0) {
        push({
          role: 'error',
          text: `${unavailable.join(' और ')} provider अभी उपलब्ध नहीं है — बाद में resend करें। (Channel provider temporarily unavailable - retry later; verification stays mandatory.)`,
        });
      }
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function verifyChannel(channel: OtpChannel): Promise<void> {
    if (!resumeToken) return;
    const otp = otpInputs[channel].trim();
    if (!/^\d{6}$/.test(otp)) {
      push({ role: 'error', text: '6 अंकों का OTP डालें। (Enter the 6-digit code.)' });
      return;
    }
    setBusy(true);
    try {
      await verifyRegistrationOtp({ resumeToken, channel, otp });
      const nextVerified = {
        email: verified.email || channel === 'EMAIL',
        whatsapp: verified.whatsapp || channel === 'WHATSAPP',
      };
      setVerified(nextVerified);
      setOtpInputs((prev) => ({ ...prev, [channel]: '' }));
      push({
        role: 'bot',
        text: channel === 'EMAIL' ? 'Email verify हो गया ✓' : 'WhatsApp verify हो गया ✓',
      });
      if (nextVerified.email && nextVerified.whatsapp) {
        setStage('password');
        push({ role: 'bot', text: PASSWORD_PROMPT });
      }
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function resendChannel(channel: OtpChannel): Promise<void> {
    if (!resumeToken) return;
    setBusy(true);
    try {
      const res = await resendRegistrationOtp({ resumeToken, channel });
      const key = channel === 'EMAIL' ? 'email' : 'whatsapp';
      setStartInfo((prev) =>
        prev
          ? {
              ...prev,
              sendStatus: {
                ...prev.sendStatus,
                [key]: res.sendStatus === 'sent' ? 'sent' : 'unavailable',
              },
              resendRemaining: { ...prev.resendRemaining, [key]: res.resendRemaining },
            }
          : prev,
      );
      push({
        role: 'bot',
        text: `नया OTP भेज दिया गया (${res.sendStatus}). बचे resends: ${res.resendRemaining}`,
      });
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(): Promise<void> {
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError('Password कम से कम 8 characters का होना चाहिए। (Minimum 8 characters.)');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Password और Confirm Password मेल नहीं खाते। (Passwords do not match.)');
      return;
    }
    if (!resumeToken) return;
    setBusy(true);
    try {
      await setRegistrationPassword({
        resumeToken,
        password,
        ...(classification ? { accountType: classification } : {}),
      });
      setStage('created');
      push({
        role: 'bot',
        text: 'आपका SocialOps account बन गया है 🎉 अब आप sign in कर सकते हैं।',
      });
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  }

  function restart(): void {
    const fresh = createConversation();
    setConversation(fresh);
    setStage('discovery');
    setMessages([{ role: 'bot', text: botMessageFor(fresh) }]);
    setResumeToken(null);
    setStartInfo(null);
    setSnapshot(null);
    setVerified({ email: false, whatsapp: false });
    setClassification(null);
    setOtpInputs({ EMAIL: '', WHATSAPP: '' });
    setPassword('');
    setConfirmPassword('');
    setLockedUntil(null);
    setIdentityError(null);
    setPasswordError(null);
  }
  const channelRows: Array<{
    id: OtpChannel;
    label: string;
    contact: string;
    remaining: number | null;
    sendStatus: 'sent' | 'unavailable' | null;
    verified: boolean;
  }> = [
    {
      id: 'EMAIL',
      label: 'Email',
      contact: snapshot?.maskedEmail ?? startInfo?.maskedEmail ?? '',
      remaining: snapshot?.resendRemaining.email ?? startInfo?.resendRemaining.email ?? null,
      sendStatus: startInfo?.sendStatus.email ?? null,
      verified: verified.email,
    },
    {
      id: 'WHATSAPP',
      label: 'WhatsApp',
      contact: snapshot?.maskedPhone ?? startInfo?.maskedPhone ?? '',
      remaining: snapshot?.resendRemaining.whatsapp ?? startInfo?.resendRemaining.whatsapp ?? null,
      sendStatus: startInfo?.sendStatus.whatsapp ?? null,
      verified: verified.whatsapp,
    },
  ];

  return (
    <div className="space-y-4">
      <div
        ref={transcriptRef}
        aria-live="polite"
        className="max-h-80 space-y-3 overflow-y-auto pr-1"
      >
        {messages.map((m, i) =>
          m.role === 'error' ? (
            <p
              key={i}
              className="w-full rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200"
            >
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <p
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] whitespace-pre-line rounded-2xl bg-blue-600 px-4 py-2 text-sm text-white'
                    : 'max-w-[85%] whitespace-pre-line rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm text-slate-100'
                }
              >
                {m.text}
              </p>
            </div>
          ),
        )}
      </div>

      {lockSeconds > 0 && (
        <p className="text-xs text-amber-300">
          Verification temporarily locked — retry in {lockSeconds}s.
        </p>
      )}

      {/* Dead-end fallback. NEVER shown while the identity wizard is active:
          those steps run before /start and a null resumeToken is normal
          there, so offering only "Start again" would discard a conversation
          the user can still legitimately finish. */}
      {dead && !inIdentityWizard && (
        <div className="space-y-2">
          <Button type="button" onClick={restart}>
            फिर से शुरू करें (Start again)
          </Button>
        </div>
      )}

      {!dead && (stage === 'discovery' || stage === 'forced-choice') && (
        <div className="grid gap-2">
          {(stage === 'discovery' ? optionsFor(conversation) : FORCED_OPTIONS).map(
            (opt) => (
              <Button
                key={opt.id}
                type="button"
                variant="secondary"
                className="justify-start text-left whitespace-normal"
                disabled={busy}
                onClick={() => {
                  if (stage === 'forced-choice') {
                    chooseForcedClassification(opt.id as AccountType, opt.label);
                  } else {
                    chooseOption(opt.id, opt.label);
                  }
                }}
              >
                {opt.label}
              </Button>
            ),
          )}
        </div>
      )}

      {/* Rule 7 identity wizard - ONE field at a time, in order
          name -> WhatsApp mobile -> email.

          Visibility is driven PURELY by the state machine via
          `identitySubStep`. It is deliberately NOT gated on the local
          `stage` or on `dead`: those describe the post-/start credential
          lifecycle, whereas every identity step runs BEFORE /start. Gating
          the inputs on them is what previously let the "Start again"
          fallback mask the Name input entirely. */}
      {inIdentityWizard && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitIdentityFieldAndAdvance(identityDraft);
          }}
        >
          {identitySubStep === 'fullName' && (
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Name</Label>
              <Input
                id="reg-name"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="आपका पूरा नाम"
                autoComplete="name"
              />
            </div>
          )}

          {identitySubStep === 'phone' && (
            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">WhatsApp mobile</Label>
              <Input
                id="reg-phone"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="9876543210 / +919876543210"
                inputMode="tel"
                autoComplete="tel"
              />
              <p className="text-xs text-slate-500">
                यह WhatsApp से जुड़ा नंबर होना चाहिए। (Must be a WhatsApp-connected
                number.)
              </p>
            </div>
          )}

          {identitySubStep === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email address</Label>
              <Input
                id="reg-email"
                type="email"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          )}

          {identityError && (
            <p className="text-xs text-red-300">{identityError}</p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? 'भेज रहे हैं…'
              : identitySubStep === 'email'
                ? 'OTP भेजें (Send OTP)'
                : 'अगला (Next)'}
          </Button>
        </form>
      )}
      {!dead && stage === 'verification' && (
        <div className="space-y-4">
          {channelRows.map((row) => (
            <div
              key={row.id}
              className="space-y-2 rounded-lg border border-white/10 bg-slate-900/50 p-3"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-100">{row.label}</span>
                <span
                  className={row.verified ? 'text-emerald-300' : 'text-slate-400'}
                >
                  {row.verified
                    ? 'Verified ✓'
                    : row.sendStatus === 'unavailable'
                      ? 'Provider unavailable — retry later'
                      : 'Pending'}
                </span>
              </div>
              <p className="text-xs text-slate-500">{row.contact}</p>
              {!row.verified && (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`${row.label} OTP`}
                    value={otpInputs[row.id]}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    onChange={(e) =>
                      setOtpInputs((prev) => ({
                        ...prev,
                        [row.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    disabled={busy || lockSeconds > 0}
                    onClick={() => void verifyChannel(row.id)}
                  >
                    Verify
                  </Button>
                </div>
              )}
              {!row.verified && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    busy ||
                    lockSeconds > 0 ||
                    (row.remaining !== null && row.remaining <= 0)
                  }
                  onClick={() => void resendChannel(row.id)}
                >
                  Resend{row.remaining !== null ? ` (${row.remaining} left)` : ''}
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-slate-500">
            दोनों verifications ज़रूरी हैं; कोई भी bypass नहीं है। (Both
            verifications are mandatory - no bypass exists.)
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <p className="text-xs text-slate-500">
              Dev console: OTP codes are printed in the API terminal
              (development/test only; never in production).
            </p>
          )}
        </div>
      )}

      {!dead && stage === 'password' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reg-pw">Password</Label>
            <Input
              id="reg-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-pw2">Confirm Password</Label>
            <Input
              id="reg-pw2"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-slate-500">
            कम से कम 8 characters; दोनों verifications पूरे हो चुके हैं।
            (Minimum 8 characters; both verifications are complete.)
          </p>
          {passwordError && (
            <p className="text-xs text-red-300">{passwordError}</p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'बना रहे हैं…' : 'Account बनाएँ (Create account)'}
          </Button>
        </form>
      )}

      {stage === 'created' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            आपका account तैयार है। (Your account is ready - sign in to continue.)
          </p>
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
