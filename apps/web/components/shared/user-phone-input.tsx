'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { USER_PHONE_COUNTRIES } from '@/lib/user-phone';

interface UserPhoneInputProps {
  idPrefix: string;
  country: string;
  number: string;
  onCountryChange: (country: string) => void;
  onNumberChange: (number: string) => void;
  disabled?: boolean;
  error?: string;
}

export function UserPhoneInput({
  idPrefix,
  country,
  number,
  onCountryChange,
  onNumberChange,
  disabled = false,
  error,
}: UserPhoneInputProps) {
  const countryId = `${idPrefix}-country`;
  const numberId = `${idPrefix}-number`;
  const errorId = `${idPrefix}-error`;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_2fr]">
      <div className="space-y-2">
        <Label htmlFor={countryId}>Country</Label>
        <select
          id={countryId}
          autoComplete="country"
          required
          value={country}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onCountryChange(event.target.value)}
        >
          <option value="">Select country</option>
          {USER_PHONE_COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name} (+{item.callingCode})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={numberId}>
          Mobile number <span className="text-red-400">(required)</span>
        </Label>
        <Input
          id={numberId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={50}
          required
          value={number}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onNumberChange(event.target.value)}
        />
        {error && (
          <p id={errorId} className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
