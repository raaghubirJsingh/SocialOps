import { describe, expect, it } from '@jest/globals';

import { registerEmployeeSchema } from '../../auth/dto/register-employee.dto.js';
import { registerFreelancerSchema } from '../../auth/dto/register-freelancer.dto.js';
import { registrationStartSchema } from '../dto/registration.dto.js';
import { isValidUserPhoneE164, normalizeUserPhone } from './user-phone.js';

describe('User phone normalization', () => {
  it.each([
    ['IN', '9876543210', '+919876543210'],
    ['IN', '919876543210', '+919876543210'],
    ['IN', '+919876543210', '+919876543210'],
    ['GB', '7400123456', '+447400123456'],
    ['DE', '15112345678', '+4915112345678'],
    ['FR', '612345678', '+33612345678'],
  ])('normalizes %s mobile input to E.164', (country, local, expected) => {
    expect(normalizeUserPhone(country, local)).toBe(expected);
    expect(isValidUserPhoneE164(expected)).toBe(true);
  });

  it.each([
    ['GB', '02070313000'],
    ['DE', '30123456'],
    ['US', '2025550123'],
  ])('rejects a number not classified strictly as MOBILE (%s)', (country, local) => {
    expect(normalizeUserPhone(country, local)).toBeNull();
  });

  it.each([
    ['', '7400123456'],
    ['ZZ', '7400123456'],
    ['GB', '12345'],
    ['GB', 'not a number'],
    ['GB', '+919876543210'],
  ])('rejects invalid selected country/number (%s, %s)', (country, local) => {
    expect(normalizeUserPhone(country, local)).toBeNull();
  });

  it('requires country and mobile input on all registration DTOs', () => {
    const employee = {
      fullName: 'Employee One',
      email: 'employee@example.com',
      password: 'password123',
    };
    const freelancer = {
      fullName: 'Freelancer One',
      email: 'freelancer@example.com',
      password: 'password123',
    };
    const staged = {
      fullName: 'Staged User',
      email: 'staged@example.com',
      accountType: 'CLIENT',
    };

    expect(registerEmployeeSchema.safeParse(employee).success).toBe(false);
    expect(registerFreelancerSchema.safeParse(freelancer).success).toBe(false);
    expect(registrationStartSchema.safeParse(staged).success).toBe(false);

    expect(
      registrationStartSchema.parse({
        ...staged,
        phone: { country: 'GB', number: '7400123456' },
      }).phone,
    ).toBe('+447400123456');
  });
});
