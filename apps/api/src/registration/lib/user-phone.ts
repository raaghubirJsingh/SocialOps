import {
  isSupportedCountry,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/max';

/**
 * Normalize a country-selected local number to E.164.
 *
 * This policy applies to User.phone only. The caller must provide a
 * supported ISO 3166-1 alpha-2 country; no default country is inferred.
 */
export function normalizeUserPhone(
  country: string,
  localNumber: string,
): string | null {
  if (!isSupportedCountry(country)) return null;

  const parsed = parsePhoneNumberFromString(localNumber.trim(), {
    defaultCountry: country,
    extract: false,
  });
  if (
    !parsed ||
    parsed.country !== country ||
    !parsed.isValid() ||
    parsed.getType() !== 'MOBILE'
  ) {
    return null;
  }

  return parsed.number;
}

/** Validate a stored User.phone as canonical E.164 and strictly mobile. */
export function isValidUserPhoneE164(value: string): boolean {
  if (!value.startsWith('+')) return false;

  const parsed = parsePhoneNumberFromString(value, { extract: false });
  return Boolean(
    parsed &&
      parsed.number === value &&
      parsed.isValid() &&
      parsed.getType() === 'MOBILE',
  );
}
