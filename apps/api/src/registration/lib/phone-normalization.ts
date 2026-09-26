/**
 * Phone normalization for Registration Phase v1.0 (OPEN-2, LOCKED C).
 *
 * Approved input shapes (the ONLY accepted shapes):
 *   - 9876543210        (10 digits, national format)
 *   - 919876543210      (12 digits, country-code prefixed without '+')
 *   - +919876543210     (12 digits after '+')
 *
 * All three represent the SAME number and normalize to ONE canonical
 * representation: '+919876543210'.
 *
 * Common visual separators (spaces, hyphens, parentheses, dots) are
 * stripped before matching. Any input outside the approved shapes is
 * REJECTED (returns null) - no additional country/format rules may be
 * invented (GATE: OPEN-2).
 */
const SEPARATORS = /[\s\-().]/g;

export function normalizePhone(rawInput: string): string | null {
  const cleaned = rawInput.replace(SEPARATORS, '');

  // Shape 1: 10-digit national number -> canonical '+91' + digits.
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Shape 2: 12 digits starting with the approved country prefix '91'.
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Shape 3: explicit '+' form of shape 2.
  if (/^\+91\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}