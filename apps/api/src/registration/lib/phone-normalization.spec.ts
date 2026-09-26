import { normalizePhone } from './phone-normalization.js';

/**
 * Phone normalization (OPEN-2, LOCKED C): ONLY the three approved input
 * shapes are accepted, and all three normalize to ONE canonical form.
 * No additional country/format rules may be invented.
 */
describe('normalizePhone (approved OPEN-2 shapes)', () => {
  it('normalizes all three approved shapes to the same canonical form', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
  });

  it('strips only common visual separators before matching', () => {
    expect(normalizePhone(' 98765 43210 ')).toBe('+919876543210');
    expect(normalizePhone('98765-43210')).toBe('+919876543210');
    expect(normalizePhone('(98765) 43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
  });

  it('rejects everything outside the approved shapes', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('987654321')).toBeNull(); // 9 digits
    expect(normalizePhone('98765432101')).toBeNull(); // 11 digits
    expect(normalizePhone('+9876543210')).toBeNull(); // '+' without the approved prefix
    expect(normalizePhone('819876543210')).toBeNull(); // wrong country prefix
    expect(normalizePhone('+9198765432100')).toBeNull(); // too long
    expect(normalizePhone('abcdefghij')).toBeNull();
    expect(normalizePhone('9876543210x')).toBeNull();
  });
});
