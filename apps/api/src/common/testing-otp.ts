/**
 * Testing OTP mode helpers.
 *
 * Fixed OTPs are allowed ONLY in explicitly enabled non-production
 * environments. Production always uses normal secure OTP generation.
 */
export function isTestingOtpEnabled(): boolean {
  return (
    process.env.TESTING_OTP_ENABLED === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export function getTestingEmailOtp(): string {
  return process.env.TESTING_EMAIL_OTP ?? '22222222';
}

export function getTestingMobileOtp(): string {
  return process.env.TESTING_MOBILE_OTP ?? '11111111';
}
