import { ApiError } from '@/lib/api';
import {
  REGISTRATION_ERROR_MESSAGES,
  describeRegistrationError,
} from '@/lib/registration-error';

/**
 * Table-driven contract tests for the PURE registration error mapper.
 *
 * These are the security guarantees as much as the copy: every case asserts
 * that the rendered message contains NO raw `details[]` entry, NO backend
 * message text, NO status code and NO stack-trace fragment.
 */

function apiError(status: number, body: unknown, message = 'backend message'): ApiError {
  return new ApiError(status, message, body);
}

const VALIDATION_400 = (details: Array<{ path: string; message: string }>) =>
  apiError(400, {
    statusCode: 400,
    error: 'ValidationError',
    message: 'Request payload failed validation',
    details,
  });

describe('describeRegistrationError - status/code mapping', () => {
  it.each([
    [
      '400 details[].path = phone',
      VALIDATION_400([{ path: 'phone', message: 'Invalid phone format' }]),
      REGISTRATION_ERROR_MESSAGES.invalidPhone,
    ],
    [
      '400 details[].path = email',
      VALIDATION_400([{ path: 'email', message: 'Invalid email format' }]),
      REGISTRATION_ERROR_MESSAGES.invalidEmail,
    ],
    [
      '400 details[].path = fullName',
      VALIDATION_400([{ path: 'fullName', message: 'Full name is required' }]),
      REGISTRATION_ERROR_MESSAGES.invalidFullName,
    ],
    [
      '400 with an UNKNOWN field path -> generic',
      VALIDATION_400([{ path: 'resumeToken', message: 'secret internal rule' }]),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '400 with a NESTED field path -> generic (no partial match)',
      VALIDATION_400([{ path: 'phone.countryCode', message: 'nope' }]),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '400 with NO details at all -> generic',
      apiError(400, { statusCode: 400, message: 'Request payload failed validation' }),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '400 with malformed details -> generic',
      apiError(400, { details: 'not-an-array' }),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '403 without retryAfterSeconds -> generic (lifecycle failure)',
      apiError(403, 'Email already in use'),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '403 with an EMPTY body -> generic (no longer treated as email)',
      apiError(403, null),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '403 + code OTP_LOCKED -> the temporary lock line (NOT the rate-limit line)',
      apiError(403, { code: 'OTP_LOCKED', retryAfterSeconds: 3600 }),
      REGISTRATION_ERROR_MESSAGES.otpLocked,
    ],
    [
      '403 + code OTP_RESEND_LIMIT -> generic resend-exhausted line',
      apiError(403, { code: 'OTP_RESEND_LIMIT' }),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '403 + code OTP_RESEND_LIMIT + retryAfterSeconds -> generic (NOT rate-limited)',
      apiError(403, { code: 'OTP_RESEND_LIMIT', retryAfterSeconds: 120 }),
      REGISTRATION_ERROR_MESSAGES.invalidGeneric,
    ],
    [
      '409 with code EMAIL_IN_USE -> email already registered',
      apiError(409, { code: 'EMAIL_IN_USE', message: 'Email already in use' }),
      REGISTRATION_ERROR_MESSAGES.emailAlreadyRegistered,
    ],
    [
      '409 with a generic code -> already in progress',
      apiError(409, { code: 'RESOURCE_LOCKED', message: 'Resource is locked' }),
      REGISTRATION_ERROR_MESSAGES.alreadyInProgress,
    ],
    [
      '409 without a body/code -> already in progress',
      apiError(409, 'Registration already in progress for this email'),
      REGISTRATION_ERROR_MESSAGES.alreadyInProgress,
    ],
    [
      '404 in the LIFECYCLE context -> expired',
      apiError(404, 'Registration not found or has expired'),
      REGISTRATION_ERROR_MESSAGES.expired,
    ],
    [
      '409 -> already in progress',
      apiError(409, 'Registration already in progress for this email'),
      REGISTRATION_ERROR_MESSAGES.alreadyInProgress,
    ],
    [
      '500 -> connection problem',
      apiError(500, { statusCode: 500, message: 'Internal server error' }),
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
    [
      '502 with an HTML body -> connection problem',
      apiError(502, '<html>Bad Gateway</html>'),
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
    [
      'a fetch TypeError -> connection problem',
      new TypeError('Failed to fetch'),
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
    [
      'an arbitrary non-ApiError -> connection problem',
      new Error('kaboom'),
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
    ['null -> connection problem', null, REGISTRATION_ERROR_MESSAGES.connection],
    ['undefined -> connection problem', undefined, REGISTRATION_ERROR_MESSAGES.connection],
    [
      'a bare string -> connection problem',
      'something odd',
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
    [
      'an unknown status (418) -> connection problem',
      apiError(418, { message: 'teapot' }),
      REGISTRATION_ERROR_MESSAGES.connection,
    ],
  ])('%s', (label, err, expected) => {
    expect(describeRegistrationError(err)).toBe(expected);
    // The identity context must never change any case EXCEPT 404.
    if (!(label as string).includes('404')) {
      expect(describeRegistrationError(err, 'identity')).toBe(expected);
    }
  });

  it('maps 403 WITH retryAfterSeconds to the rate-limit line, not the email line', () => {
    const err = apiError(403, { retryAfterSeconds: 42 });
    const out = describeRegistrationError(err);
    expect(out).toContain(REGISTRATION_ERROR_MESSAGES.rateLimited);
    expect(out).toContain('42');
    expect(out).not.toBe(REGISTRATION_ERROR_MESSAGES.emailAlreadyRegistered);
  });

  it('a 403 + OTP_LOCKED + retryAfterSeconds is the lock line, NOT the rate-limit line', () => {
    const err = apiError(403, { code: 'OTP_LOCKED', retryAfterSeconds: 3600 });
    const out = describeRegistrationError(err);
    expect(out).toBe(REGISTRATION_ERROR_MESSAGES.otpLocked);
    expect(out).not.toContain(REGISTRATION_ERROR_MESSAGES.rateLimited);
    expect(out).not.toMatch(/\b3600\b/);
  });

  it('a 403 + OTP_RESEND_LIMIT + retryAfterSeconds is generic, NOT the rate-limit line', () => {
    const err = apiError(403, { code: 'OTP_RESEND_LIMIT', retryAfterSeconds: 120 });
    const out = describeRegistrationError(err);
    expect(out).toBe(REGISTRATION_ERROR_MESSAGES.invalidGeneric);
    expect(out).not.toContain(REGISTRATION_ERROR_MESSAGES.rateLimited);
    expect(out).not.toMatch(/\b120\b/);
  });

describe('describeRegistrationError - no internal detail ever leaks', () => {
  const HOSTILE_INPUTS: Array<[string, unknown]> = [
    [
      '400 details[] text',
      VALIDATION_400([{ path: 'phone', message: 'LEAKED-INTERNAL-RULE-XYZ' }]),
    ],
    [
      '400 unknown field with a secret-sounding message',
      VALIDATION_400([{ path: 'password', message: 'LEAKED-INTERNAL-RULE-XYZ' }]),
    ],
    ['403 backend message', apiError(403, 'Email already in use', 'LEAKED-ABC')],
    ['404 backend message', apiError(404, 'LEAKED-404-TEXT')],
    ['409 backend message', apiError(409, { message: 'LEAKED-409-TEXT' })],
    ['500 stack-ish body', apiError(500, { stack: 'LEAKED-STACK-XYZ' })],
    ['network error', new TypeError('LEAKED-NETWORK-XYZ')],
    [
      '403 + OTP_LOCKED + retryAfterSeconds (lock is NOT a rate-limit leak)',
      apiError(403, { code: 'OTP_LOCKED', retryAfterSeconds: 3600 }),
    ],
    [
      '403 + OTP_RESEND_LIMIT + retryAfterSeconds (NOT a rate-limit leak)',
      apiError(403, { code: 'OTP_RESEND_LIMIT', retryAfterSeconds: 120 }),
    ],
  ];

  it.each(HOSTILE_INPUTS)('%s', (_label, err) => {
    const out = describeRegistrationError(err, 'identity');
    expect(out).not.toContain('LEAKED');
    // Never a raw status code, HTTP verb, or backend envelope wording.
    expect(out).not.toMatch(/\b(400|401|403|404|409|422|429|500|502|503)\b/);
    expect(out).not.toMatch(/ValidationError|Internal server error|statusCode|error:/i);
    // Never the backend's own English sentence.
    expect(out).not.toContain('Email already in use');
    expect(out).not.toContain('Registration not found');
    expect(out).not.toContain('Registration already in progress');
  });

  it('never returns an empty message', () => {
    for (const [, err] of HOSTILE_INPUTS) {
      const out = describeRegistrationError(err, 'lifecycle');
      expect(out.trim().length).toBeGreaterThan(0);
    }
  });
});
  it('maps 429 to the rate-limit line', () => {
    const err = apiError(429, { retryAfterSeconds: 15 });
    const out = describeRegistrationError(err);
    expect(out).toContain(REGISTRATION_ERROR_MESSAGES.rateLimited);
    expect(out).toContain('15');
  });

  it('maps 404 differently per context - the identity step is NOT "expired"', () => {
    // The committed-then-failed trap: at the identity step a 404 means an
    // UNFINISHED pending registration owns this email, so the user must be told
    // to wait or use a different email - never that their session expired.
    const err = apiError(404, 'Registration not found or has expired');
    expect(describeRegistrationError(err, 'identity')).toBe(
      REGISTRATION_ERROR_MESSAGES.identityEmailPending,
    );
    expect(describeRegistrationError(err, 'lifecycle')).toBe(
      REGISTRATION_ERROR_MESSAGES.expired,
    );
    expect(describeRegistrationError(err, 'identity')).not.toBe(
      REGISTRATION_ERROR_MESSAGES.expired,
    );
  });
});