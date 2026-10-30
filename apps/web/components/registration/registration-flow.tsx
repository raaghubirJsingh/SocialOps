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
  describeRegistrationError,
  type RegistrationErrorContext,
} from '@/lib/registration-error';
import {
  applyOtpResendResponse,
  applyOtpVerifyResponse,
  createRegistrationSessionFromStart,
  isOtpVerifyResponse,
} from '@/lib/registration-verification';
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
  RegistrationSession,
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
  initialSession?: RegistrationSession;
}

function bodyOf(err: unknown): { message?: string; retryAfterSeconds?: number } {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    return err.body as { message?: string; retryAfterSeconds?: number };
  }
  return {};
}

/**
 * Response-shape guard for POST /auth/registration/start.
 *
 * `apiFetch` performs NO runtime shape validation: an empty body parses to
 * `null` and a non-JSON body degrades to the raw text string (its
 * `safeJsonParse` swallows the parse error). Dereferencing such a "result"
 * would throw a bare TypeError, which is indistinguishable from a network
 * failure at the call site AND happens only AFTER the server has already
 * committed the PendingRegistration row. Validating first means the caller can
 * treat a malformed 2xx exactly like a dead API and surface the friendly
 * connection line, instead of crashing deeper in the component.
 */
function isValidStartResult(
  value: unknown,
): value is RegistrationStartResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    (candidate['status'] !== 'pending_created' &&
      candidate['status'] !== 'pending_resumed') ||
    typeof candidate['resumeToken'] !== 'string' ||
    candidate['resumeToken'] === '' ||
    typeof candidate['expiresAt'] !== 'string' ||
    typeof candidate['maskedEmail'] !== 'string' ||
    typeof candidate['maskedPhone'] !== 'string' ||
    (candidate['accountType'] !== null &&
      candidate['accountType'] !== 'CLIENT' &&
      candidate['accountType'] !== 'SERVICE_PROVIDER') ||
    (candidate['clientType'] !== null &&
      candidate['clientType'] !== 'INDIVIDUAL' &&
      candidate['clientType'] !== 'BUSINESS') ||
    typeof candidate['emailVerified'] !== 'boolean' ||
    typeof candidate['whatsappVerified'] !== 'boolean' ||
    (candidate['lockedUntil'] !== null &&
      typeof candidate['lockedUntil'] !== 'string')
  ) {
    return false;
  }
  const sendStatus = candidate['sendStatus'];
  const resendRemaining = candidate['resendRemaining'];
  if (
    sendStatus === null ||
    typeof sendStatus !== 'object' ||
    Array.isArray(sendStatus) ||
    resendRemaining === null ||
    typeof resendRemaining !== 'object' ||
    Array.isArray(resendRemaining)
  ) {
    return false;
  }
  const channels = sendStatus as Record<string, unknown>;
  const remaining = resendRemaining as Record<string, unknown>;
  return (
    (channels['email'] === 'sent' || channels['email'] === 'unavailable') &&
    (channels['whatsapp'] === 'sent' ||
      channels['whatsapp'] === 'unavailable') &&
    typeof remaining['email'] === 'number' &&
    Number.isFinite(remaining['email']) &&
    remaining['email'] >= 0 &&
    typeof remaining['whatsapp'] === 'number' &&
    Number.isFinite(remaining['whatsapp']) &&
    remaining['whatsapp'] >= 0
  );
}

/**
 * Thin delegate to the PURE mapper in `@/lib/registration-error`.
 *
 * The mapper owns every status/code decision; this wrapper only supplies the
 * flow context, because a 404 means "expired session" in the later staged
 * calls but "an unfinished registration already owns this email" at the
 * identity step.
 *
 * NOTE: `err.message` is deliberately NOT used anywhere. It used to surface a
 * raw transport string for an ApiError with no recognisable body, and a bare
 * generic line for a non-ApiError; both are now covered by the mapper's safe
 * connection message.
 */
function messageFromError(
  err: unknown,
  context: RegistrationErrorContext = 'lifecycle',
): string {
  return describeRegistrationError(err, context);
}

const EMAIL_OTP_HINT =
  'दोनों चैनल पर OTP भेज दिया गया है। Email और WhatsApp दोनों verify करना ज़रूरी है। (Sent to both channels — both verifications are mandatory.)';
const PASSWORD_PROMPT =
  'बहुत बढ़िया! अब अपना password बनाइए (कम से कम 8 characters)।';

export function RegistrationFlow({ initialSession }: RegistrationFlowProps) {
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversation(),
  );
  const [stage, setStage] = useState<Stage>(() => {
    if (!initialSession) return 'discovery';
    if (!initialSession.accountType) return 'forced-choice';
    return initialSession.stage;
  });
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (!initialSession) {
      return [{ role: 'bot', text: botMessageFor(createConversation()) }];
    }
    const lines = [
      `आपका registration जारी है (${initialSession.maskedEmail} / ${initialSession.maskedPhone}).`,
    ];
    if (!initialSession.accountType) lines.push(FORCED_QUESTION);
    else if (initialSession.stage === 'verification') lines.push(EMAIL_OTP_HINT);
    else lines.push(PASSWORD_PROMPT);
    return lines.map((text) => ({ role: 'bot' as const, text }));
  });

  const [session, setSession] = useState<RegistrationSession | null>(
    initialSession ?? null,
  );

  // Identity wizard (Rule 7) is owned by the pure state machine; this
  // component only renders the single field for the current sub-step.
  const [identityError, setIdentityError] = useState<string | null>(null);
  /**
   * Set when the identity submission failed, so the "Start again" affordance
   * is rendered even if no input is currently on screen. Without it the chat
   * could reach a state with no input AND no action at all.
   */
  const [offerRestart, setOfferRestart] = useState(false);
  /** Draft text for the one identity input currently on screen. */
  const [identityDraft, setIdentityDraft] = useState('');

  // Which identity field the state machine is asking for right now. The
  // draft is cleared at the moment the step advances (in the submit handler),
  // so a previous answer is never carried into the next input.
  const identitySubStep = identityFieldFor(conversation.stage);

  /**
   * Rule 7 progress.
   *
   * The identity wizard asks exactly THREE questions in a fixed order, one
   * input at a time. The state machine already guarantees that (see
   * `identity-name` -> `identity-phone` -> `identity-email` in
   * lib/registration-conversation.ts); surfacing the position makes the
   * sequence legible and signals that nothing else is being asked, which is
   * the "hyper-focused, one thing at a time" intent.
   */
  const IDENTITY_STEPS = ['fullName', 'phone', 'email'] as const;
  const IDENTITY_STEP_LABELS = ['Name', 'WhatsApp', 'Email'] as const;
  const identityStepIndex = identitySubStep
    ? IDENTITY_STEPS.indexOf(identitySubStep)
    : -1;

  const [otpInputs, setOtpInputs] = useState<{ EMAIL: string; WHATSAPP: string }>({
    EMAIL: '',
    WHATSAPP: '',
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
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

  const lockedUntil = session?.lockedUntil
    ? Date.parse(session.lockedUntil)
    : null;
  const lockSeconds =
    lockedUntil && lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
  const resumeToken = session?.resumeToken ?? null;
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

  function handleFailure(
    err: unknown,
    context: RegistrationErrorContext = 'lifecycle',
  ): void {
    const body = bodyOf(err);
    if (err instanceof ApiError && err.status === 403 && body.retryAfterSeconds) {
      const retryAfterSeconds = body.retryAfterSeconds;
      setSession((current) =>
        current
          ? {
              ...current,
              lockedUntil: new Date(now + retryAfterSeconds * 1000).toISOString(),
            }
          : null,
      );
    }
    if (err instanceof ApiError && err.status === 404 && context === 'lifecycle') {
      setSession(null); // dead credential - restart required
    }
    push({ role: 'error', text: messageFromError(err, context) });
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
    setSession((current) =>
      current ? { ...current, accountType: value } : current,
    );
    // The explicit forced choice (never guessed - L13) travels with the
    // password stage for resume flows, where the pending row started
    // with accountType = null.
    const target: Stage = session?.stage ?? 'verification';
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

  /**
   * Recover from a FAILED identity submission.
   *
   * `submitIdentityField` advanced the PURE state machine to the terminal
   * 'identity' stage BEFORE the /start round-trip, so a failure used to leave
   * the chat with no input (`identityFieldFor('identity') === null`), no
   * "Start again" button (`dead` is false while `stage === 'identity'`), and
   * nothing else - a hard dead end.
   *
   * The rollback therefore lives HERE, in the component, and deliberately not
   * in `registration-conversation.ts`: that module stays pure and one-way
   * (its own contract says a field is asked exactly once, which is still true
   * for every SUCCESSFUL step). Only the failing step is revisited, the
   * already-collected name/phone are preserved, and the submitted value is
   * put back in the box so the user does not retype it.
   */
  function recoverIdentityStep(state: ConversationState): void {
    setConversation((prev) =>
      prev.stage === 'identity' ? { ...prev, stage: 'identity-email' } : prev,
    );
    setIdentityDraft(state.email ?? '');
    setOfferRestart(true);
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

      // Validate BEFORE touching any state: a malformed 2xx must not
      // half-advance the UI, and it must not surface as a raw TypeError.
      if (!isValidStartResult(result)) {
        handleIdentityFailure(null, state);
        return;
      }

      const nextSession = createRegistrationSessionFromStart(result);
      setSession(nextSession);
      setStage(
        nextSession.accountType ? nextSession.stage : 'forced-choice',
      );
      push({
        role: 'bot',
        text: nextSession.accountType
          ? nextSession.stage === 'password'
            ? PASSWORD_PROMPT
            : EMAIL_OTP_HINT
          : FORCED_QUESTION,
      });
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
      handleIdentityFailure(err, state);
    } finally {
      setBusy(false);
    }
  }

  /**
   * A failed identity submission, in ONE place.
   *
   * The message goes BOTH into the transcript and next to the input, and the
   * email step is restored, so the user always has a visible input and always
   * has an action. `null` is the sentinel for "2xx with an unusable body",
   * which the pure mapper renders as the friendly connection line.
   */
  function handleIdentityFailure(
    err: unknown,
    state: ConversationState,
  ): void {
    const message = messageFromError(err, 'identity');
    setIdentityError(message);
    push({ role: 'error', text: message });
    recoverIdentityStep(state);
  }

  async function verifyChannel(channel: OtpChannel): Promise<void> {
    if (!session) return;
    const otp = otpInputs[channel].trim();
    if (!/^\d{6}$/.test(otp)) {
      push({ role: 'error', text: '6 अंकों का OTP डालें। (Enter the 6-digit code.)' });
      return;
    }
    setBusy(true);
    try {
      const response = await verifyRegistrationOtp({
        resumeToken: session.resumeToken,
        channel,
        otp,
      });
      if (!isOtpVerifyResponse(response)) {
        // Fail closed: a 2xx with an unusable body must surface the
        // friendly connection line, never a success mark.
        handleFailure(null);
        return;
      }
      const { session: nextSession, advanceToPassword } = applyOtpVerifyResponse(
        session,
        response,
      );
      setSession(nextSession);
      setOtpInputs((prev) => ({ ...prev, [channel]: '' }));
      push({
        role: 'bot',
        text: channel === 'EMAIL' ? 'Email verify हो गया ✓' : 'WhatsApp verify हो गया ✓',
      });
      if (advanceToPassword) {
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
    if (!session) return;
    setBusy(true);
    try {
      const res = await resendRegistrationOtp({
        resumeToken: session.resumeToken,
        channel,
      });
      const nextSession = applyOtpResendResponse(session, res);
      setSession(nextSession);
      if (session.stage !== 'password' && nextSession.stage === 'password') {
        setStage('password');
        push({ role: 'bot', text: PASSWORD_PROMPT });
      }
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
    if (!session) return;
    setBusy(true);
    try {
      await setRegistrationPassword({
        resumeToken: session.resumeToken,
        password,
        ...(session.accountType ? { accountType: session.accountType } : {}),
        ...(session.clientType ? { clientType: session.clientType } : {}),
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
    setSession(null);
    setOtpInputs({ EMAIL: '', WHATSAPP: '' });
    setPassword('');
    setConfirmPassword('');
    setIdentityError(null);
    setPasswordError(null);
    setIdentityDraft('');
    setOfferRestart(false);
  }
  const channelRows: Array<{
    id: OtpChannel;
    label: string;
    contact: string;
    remaining: number | null;
    sendStatus: RegistrationSession['sendStatus']['email'];
    verified: boolean;
  }> = [
    {
      id: 'EMAIL',
      label: 'Email',
      contact: session?.maskedEmail ?? '',
      remaining: session?.resendRemaining.email ?? null,
      sendStatus: session?.sendStatus.email ?? null,
      verified: session?.emailVerified ?? false,
    },
    {
      id: 'WHATSAPP',
      label: 'WhatsApp',
      contact: session?.maskedPhone ?? '',
      remaining: session?.resendRemaining.whatsapp ?? null,
      sendStatus: session?.sendStatus.whatsapp ?? null,
      verified: session?.whatsappVerified ?? false,
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
                    ? 'max-w-[85%] whitespace-pre-line rounded-2xl bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm'
                    : // Bot bubbles use `surface-panel`: a sharp 1px border and
                      // a flat fill instead of backdrop blur. Blur is reserved
                      // for the single glass modal (APP-SIDE BLUR BUDGET), and
                      // a panel keeps the text edge crisp and readable.
                      'surface-panel max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-slate-100'
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

      {/* Recovery affordance. Renders when the staged registration genuinely
          cannot continue (dead credential on a resume-gated stage) OR when an
          identity submission failed. The `offerRestart` term is what guarantees
          the user ALWAYS has at least one action: without it a failed /start
          left no input (terminal 'identity' stage) and no button either. */}
      {((dead && !inIdentityWizard) || offerRestart) && (
        <div className="space-y-2">
          <Button type="button" className="hover:-translate-y-1" onClick={restart}>
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
                // Tactile feedback: a small upward lift on hover with a
                // matching transition, mirroring the landing cards. The
                // Button base already supplies `transition-all duration-200`
                // and `active:scale-[0.98]`, so hover and press read as one
                // continuous motion.
                className="h-auto justify-start whitespace-normal rounded-xl px-4 py-3 text-left text-sm hover:-translate-y-1 hover:border-blue-500/40 hover:bg-white/[0.06]"
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
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitIdentityFieldAndAdvance(identityDraft);
          }}
        >
          {/* Step position for the one-question-at-a-time wizard. Purely
              presentational; the state machine still owns the order. */}
          <div className="surface-panel rounded-xl px-4 py-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-300">
                Step {identityStepIndex + 1} of {IDENTITY_STEPS.length}
              </span>
              <span className="text-blue-300">
                {IDENTITY_STEP_LABELS[identityStepIndex]}
              </span>
            </div>
            <div
              className="mt-2.5 flex gap-1.5"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={IDENTITY_STEPS.length}
              aria-valuenow={identityStepIndex + 1}
              aria-label="Registration progress"
            >
              {IDENTITY_STEPS.map((step, i) => (
                <span
                  key={step}
                  className={
                    i <= identityStepIndex
                      ? 'h-1.5 flex-1 rounded-full bg-blue-500'
                      : 'h-1.5 flex-1 rounded-full bg-white/10'
                  }
                />
              ))}
            </div>
          </div>

          {identitySubStep === 'fullName' && (
            <div className="space-y-1.5">
              <Label
                htmlFor="reg-name"
                className="text-sm font-medium text-slate-200"
              >
                Name
              </Label>
              <Input
                id="reg-name"
                className="h-12 text-base"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="आपका पूरा नाम"
                autoComplete="name"
                autoFocus
              />
            </div>
          )}

          {identitySubStep === 'phone' && (
            <div className="space-y-1.5">
              <Label
                htmlFor="reg-phone"
                className="text-sm font-medium text-slate-200"
              >
                WhatsApp mobile
              </Label>
              <Input
                id="reg-phone"
                className="h-12 text-base"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="9876543210 / +919876543210"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
              />
              <p className="text-xs leading-relaxed text-slate-400">
                यह WhatsApp से जुड़ा नंबर होना चाहिए। (Must be a WhatsApp-connected
                number.)
              </p>
            </div>
          )}

          {identitySubStep === 'email' && (
            <div className="space-y-1.5">
              <Label
                htmlFor="reg-email"
                className="text-sm font-medium text-slate-200"
              >
                Email address
              </Label>
              <Input
                id="reg-email"
                className="h-12 text-base"
                type="email"
                value={identityDraft}
                onChange={(e) => setIdentityDraft(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
          )}

          {identityError && (
            <p
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300"
            >
              {identityError}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl hover:-translate-y-1"
          >
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
              className="surface-panel space-y-2 rounded-xl p-4"
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
                    maxLength={8}
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
                    className="hover:-translate-y-1"
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
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl hover:-translate-y-1"
          >
            {busy ? 'बना रहे हैं…' : 'Account बनाएँ (Create account)'}
          </Button>
        </form>
      )}

      {stage === 'created' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            आपका account तैयार है। (Your account is ready - sign in to continue.)
          </p>
          <Button asChild className="h-11 w-full rounded-xl hover:-translate-y-1">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
