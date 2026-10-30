import { jest } from '@jest/globals';

import { isTestingOtpEnabled, getTestingEmailOtp, getTestingMobileOtp } from './testing-otp.js';

describe('testing-otp', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled by default', () => {
    delete process.env.TESTING_OTP_ENABLED;
    delete process.env.NODE_ENV;
    expect(isTestingOtpEnabled()).toBe(false);
  });

  it('is disabled in production even if enabled', () => {
    process.env.TESTING_OTP_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    expect(isTestingOtpEnabled()).toBe(false);
  });

  it('is enabled only in non-production when explicitly enabled', () => {
    process.env.TESTING_OTP_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    expect(isTestingOtpEnabled()).toBe(true);
  });

  it('returns approved fixed defaults', () => {
    delete process.env.TESTING_EMAIL_OTP;
    delete process.env.TESTING_MOBILE_OTP;
    expect(getTestingEmailOtp()).toBe('22222222');
    expect(getTestingMobileOtp()).toBe('11111111');
  });
});
