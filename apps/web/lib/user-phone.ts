export function normalizeSelectedUserPhone(
  countryCode: string,
  nationalNumber: string,
): string | null {
  if (countryCode !== 'IN') return null;

  const digits = nationalNumber.replace(/\D/g, '');

  if (!/^\d{10}$/.test(digits)) return null;

  return `+91${digits}`;
}