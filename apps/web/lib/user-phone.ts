import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

export interface UserPhoneInput {
  country: string;
  number: string;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export const USER_PHONE_COUNTRIES = getCountries()
  .map((country) => ({
    code: country,
    name: regionNames.of(country) ?? country,
    callingCode: getCountryCallingCode(country),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

/** Client-side usability check; the API independently applies this policy. */
export function normalizeSelectedUserPhone(
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

export function countryFromE164(value: string | null): CountryCode | '' {
  if (!value?.startsWith('+')) return '';
  const parsed = parsePhoneNumberFromString(value, { extract: false });
  return parsed?.number === value &&
    parsed.country !== undefined &&
    isSupportedCountry(parsed.country)
    ? parsed.country
    : '';
}

export function nationalNumberFromE164(value: string | null): string {
  if (!value?.startsWith('+')) return value ?? '';
  const parsed = parsePhoneNumberFromString(value, { extract: false });
  return parsed?.number === value ? parsed.nationalNumber : value;
}
