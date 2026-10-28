import {
  applyOtpResendResponse,
  applyOtpVerifyResponse,
  createRegistrationSessionFromResume,
  createRegistrationSessionFromStart,
  isOtpVerifyResponse,
} from '@/lib/registration-verification';
import type {
  OtpResendResponse,
  OtpVerifyResponse,
  RegistrationResumeSnapshot,
  RegistrationSession,
  RegistrationStartResponse,
} from '@/types/auth';

const session = (
  overrides: Partial<RegistrationSession> = {},
): RegistrationSession => ({
  resumeToken: 'resume-token',
  stage: 'verification',
  expiresAt: '2026-10-15T00:00:00.000Z',
  maskedEmail: 'a***@example.test',
  maskedPhone: '+*******3210',
  accountType: 'CLIENT',
  clientType: 'INDIVIDUAL',
  emailVerified: false,
  whatsappVerified: false,
  sendStatus: { email: 'sent', whatsapp: 'sent' },
  resendRemaining: { email: 3, whatsapp: 3 },
  lockedUntil: null,
  ...overrides,
});

const verifyResponse = (
  channel: OtpVerifyResponse['channel'],
  verified: boolean,
  bothVerified: boolean,
): OtpVerifyResponse => ({ channel, verified, bothVerified });

describe('registration verification state (server-authoritative)', () => {
  it('successful email verification marks only email', () => {
    const current = session();
    const update = applyOtpVerifyResponse(current, verifyResponse('EMAIL', true, false));
    expect(update.session.emailVerified).toBe(true);
    expect(update.session.whatsappVerified).toBe(false);
    expect(update.advanceToPassword).toBe(false);
  });

  it('successful whatsapp verification marks only whatsapp', () => {
    const current = session({ emailVerified: true });
    const update = applyOtpVerifyResponse(current, verifyResponse('WHATSAPP', true, false));
    expect(update.session.emailVerified).toBe(true);
    expect(update.session.whatsappVerified).toBe(true);
    expect(update.advanceToPassword).toBe(false);
  });

  it('bothVerified: true advances to the password stage', () => {
    const current = session({ emailVerified: true });
    const update = applyOtpVerifyResponse(current, verifyResponse('WHATSAPP', true, true));
    expect(update.session.emailVerified).toBe(true);
    expect(update.session.whatsappVerified).toBe(true);
    expect(update.session.stage).toBe('password');
    expect(update.advanceToPassword).toBe(true);
  });

  it('stale local state yields to the authoritative server verification', () => {
    // Resume/reload left both flags false, but the server already holds
    // the other channel: a single successful verify must still advance.
    const current = session();
    const update = applyOtpVerifyResponse(current, verifyResponse('EMAIL', true, true));
    expect(update.session.emailVerified).toBe(true);
    expect(update.session.whatsappVerified).toBe(false);
    expect(update.session.stage).toBe('password');
    expect(update.advanceToPassword).toBe(true);
  });

  it('a failed verification never marks a channel verified', () => {
    const current = session();
    const update = applyOtpVerifyResponse(current, verifyResponse('EMAIL', false, false));
    expect(update.session.emailVerified).toBe(false);
    expect(update.session.whatsappVerified).toBe(false);
    expect(update.advanceToPassword).toBe(false);
  });

  it('does not mutate the input flags', () => {
    const current = session();
    applyOtpVerifyResponse(current, verifyResponse('EMAIL', true, false));
    expect(current.emailVerified).toBe(false);
    expect(current.whatsappVerified).toBe(false);
  });
});

describe('registration session synchronization', () => {
  it('/start response is the source of verification and classification state', () => {
    const response: RegistrationStartResponse = {
      status: 'pending_created',
      resumeToken: 'start-token',
      expiresAt: '2026-10-15T00:00:00.000Z',
      maskedEmail: 'a***@example.test',
      maskedPhone: '+*******3210',
      accountType: 'SERVICE_PROVIDER',
      clientType: 'BUSINESS',
      emailVerified: true,
      whatsappVerified: false,
      sendStatus: { email: 'sent', whatsapp: 'unavailable' },
      resendRemaining: { email: 2, whatsapp: 3 },
      lockedUntil: null,
    };

    expect(createRegistrationSessionFromStart(response)).toMatchObject({
      resumeToken: 'start-token',
      accountType: 'SERVICE_PROVIDER',
      clientType: 'BUSINESS',
      emailVerified: true,
      whatsappVerified: false,
      resendRemaining: { email: 2, whatsapp: 3 },
      sendStatus: { email: 'sent', whatsapp: 'unavailable' },
    });
  });

  it('resume → resend → verify keeps the returned resend count and updates verification', () => {
    const snapshot: RegistrationResumeSnapshot = {
      stage: 'verification',
      expiresAt: '2026-10-15T00:00:00.000Z',
      accountType: 'CLIENT',
      clientType: 'INDIVIDUAL',
      fullName: 'Asha',
      maskedEmail: 'a***@example.test',
      maskedPhone: '+*******3210',
      emailVerified: true,
      whatsappVerified: false,
      resendRemaining: { email: 3, whatsapp: 2 },
      lockedUntil: null,
    };
    const resumed = createRegistrationSessionFromResume('resume-token', snapshot);
    const resent: OtpResendResponse = {
      channel: 'WHATSAPP',
      sendStatus: 'sent',
      resendRemaining: 1,
    };
    const afterResend = applyOtpResendResponse(resumed, resent);
    const afterVerify = applyOtpVerifyResponse(
      afterResend,
      verifyResponse('WHATSAPP', true, true),
    ).session;

    expect(afterResend.resendRemaining).toEqual({ email: 3, whatsapp: 1 });
    expect(afterResend.sendStatus.whatsapp).toBe('sent');
    expect(afterVerify).toMatchObject({
      emailVerified: true,
      whatsappVerified: true,
      stage: 'password',
      resendRemaining: { email: 3, whatsapp: 1 },
    });
  });

  it('an already-verified resend response synchronizes verification from the server', () => {
    const resent: OtpResendResponse = {
      channel: 'EMAIL',
      sendStatus: 'already_verified',
      resendRemaining: 3,
    };
    const next = applyOtpResendResponse(
      session({ whatsappVerified: true }),
      resent,
    );

    expect(next.emailVerified).toBe(true);
    expect(next.stage).toBe('password');
    expect(next.resendRemaining.email).toBe(3);
  });
});

describe('isOtpVerifyResponse shape guard', () => {
  it('accepts a well-formed verify response', () => {
    expect(isOtpVerifyResponse(verifyResponse('EMAIL', true, false))).toBe(true);
    expect(isOtpVerifyResponse(verifyResponse('WHATSAPP', false, false))).toBe(true);
  });

  it.each([
    ['null body', null],
    ['empty string body', ''],
    ['a string body', 'ok'],
    ['an array body', []],
    ['missing channel', { verified: true, bothVerified: false }],
    ['unknown channel', { channel: 'SMS', verified: true, bothVerified: false }],
    ['non-boolean verified', { channel: 'EMAIL', verified: 1, bothVerified: false }],
    ['non-boolean bothVerified', { channel: 'EMAIL', verified: true, bothVerified: 'yes' }],
    ['missing bothVerified', { channel: 'EMAIL', verified: true }],
  ])('rejects %s', (_label, value) => {
    expect(isOtpVerifyResponse(value)).toBe(false);
  });
});
