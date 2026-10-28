import { ForbiddenException } from '@nestjs/common';

import {
  LOGIN_OTP_ERROR_CODES,
  type LoginOtpErrorCode,
} from '../constants/login-otp.constants.js';

/**
 * Thrown when the login OTP resend cooldown (60 seconds) is active.
 *
 * Carries `retryAfterSeconds` so the frontend can render a countdown
 * instead of guessing. Status 429 (Too Many Requests).
 */
export class LoginOtpResendCooldownException extends ForbiddenException {
  readonly code = LOGIN_OTP_ERROR_CODES.OTP_RESEND_COOLDOWN;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super({
      code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_COOLDOWN,
      message: 'Please wait before requesting another code',
      retryAfterSeconds,
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Thrown when the login OTP resend limit (3 successful resends) is reached.
 */
export class LoginOtpResendLimitException extends ForbiddenException {
  readonly code = LOGIN_OTP_ERROR_CODES.OTP_RESEND_LIMIT;

  constructor() {
    super({
      code: LOGIN_OTP_ERROR_CODES.OTP_RESEND_LIMIT,
      message: 'Resend limit reached',
    });
  }
}

/**
 * Thrown when the login OTP challenge is locked (3 wrong attempts -> 1 hour).
 */
export class LoginOtpLockedException extends ForbiddenException {
  readonly code = LOGIN_OTP_ERROR_CODES.OTP_LOCKED;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super({
      code: LOGIN_OTP_ERROR_CODES.OTP_LOCKED,
      message: 'Verification temporarily locked',
      retryAfterSeconds,
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}