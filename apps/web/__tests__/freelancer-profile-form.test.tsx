import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('freelancer profile form contract', () => {
  const source = readFileSync('app/(app)/freelancer/profile/page.tsx', 'utf8');
  const registrationSource = readFileSync(
    'components/auth/register-freelancer-form.tsx',
    'utf8',
  );

  it('contains safe JSON parsing and profile submission handling', () => {
    expect(source).toMatch(/parseJsonField/);
    expect(source).toMatch(/if \(!trimmed\) return null;/);
    expect(source).toMatch(/Work experience and education must be valid JSON/);
    expect(source).toMatch(/updateFreelancerProfile/);
    expect(source).toMatch(/phone: \{ country: phoneCountry, number: phoneNumber\.trim\(\) \}/);
    expect(source).toMatch(/normalizeSelectedUserPhone\(phoneCountry, phoneNumber\)/);
    expect(source).toMatch(/error={phoneError \?\? undefined}/);
    expect(source).not.toMatch(/error={message \?\? undefined}/);
    expect(source).toMatch(/setPhoneError\(error\)/);
    expect(source).toMatch(/submitFreelancerProfile/);
    expect(source).toMatch(/Profile submitted\./);
  });

  it('requires a phone number during Freelancer registration', () => {
    expect(registrationSource).toMatch(/normalizeSelectedUserPhone\(phoneCountry, phone\)/);
    expect(registrationSource).toMatch(/phone: \{ country: phoneCountry, number: phone \}/);
    expect(registrationSource).toMatch(/UserPhoneInput/);
  });
});
