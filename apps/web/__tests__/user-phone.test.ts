import {
  USER_PHONE_COUNTRIES,
  countryFromE164,
  nationalNumberFromE164,
  normalizeSelectedUserPhone,
} from '../lib/user-phone';

describe('User phone input helpers', () => {
  it('offers international countries and calling codes in the selector', () => {
    expect(USER_PHONE_COUNTRIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'IN', callingCode: '91' }),
        expect.objectContaining({ code: 'GB', callingCode: '44' }),
        expect.objectContaining({ code: 'DE', callingCode: '49' }),
      ]),
    );
  });

  it.each([
    ['IN', '9876543210', '+919876543210'],
    ['IN', '919876543210', '+919876543210'],
    ['IN', '+919876543210', '+919876543210'],
    ['GB', '7400123456', '+447400123456'],
    ['DE', '15112345678', '+4915112345678'],
  ])('validates %s local mobile number', (country, number, e164) => {
    expect(normalizeSelectedUserPhone(country, number)).toBe(e164);
  });

  it.each([
    ['GB', '02070313000'],
    ['US', '2025550123'],
    ['', '7400123456'],
  ])('rejects number not strictly classified as mobile (%s)', (country, number) => {
    expect(normalizeSelectedUserPhone(country, number)).toBeNull();
  });

  it('recovers the explicit country and national portion from stored E.164', () => {
    expect(countryFromE164('+447400123456')).toBe('GB');
    expect(nationalNumberFromE164('+447400123456')).toBe('7400123456');
    expect(countryFromE164('not-a-phone')).toBe('');
  });
});
