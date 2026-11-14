'use client';

import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface UserPhoneInputProps {
  idPrefix: string;
  country: string;
  number: string;
  onCountryChange: (value: string) => void;
  onNumberChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

const COUNTRIES = [
  { code: 'IN', label: 'India (+91)', dialCode: '+91' },
] as const;

export function UserPhoneInput({
  idPrefix,
  country,
  number,
  onCountryChange,
  onNumberChange,
  disabled,
  error,
}: UserPhoneInputProps) {
  const countryCodeId = `${idPrefix}-country`;
  const numberId = `${idPrefix}-number`;
  const errorId = `${idPrefix}-error`;

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id={countryCodeId}
            variant="secondary"
            className={cn(
              'w-24 justify-start text-left font-normal',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
          >
            <span className="flex-1 text-slate-100 truncate">
              {COUNTRIES.find((c) => c.code === country)?.label ?? 'Select country'}
            </span>
            <svg
              className="ml-auto h-4 w-4 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[96px]">
          {COUNTRIES.map((c) => (
            <DropdownMenuItem
              key={c.code}
              onClick={() => onCountryChange(c.code)}
              className="cursor-pointer"
              disabled={disabled}
            >
              {c.label}
              {country === c.code && (
                <svg
                  className="ml-auto h-4 w-4 text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Input
        id={numberId}
        type="tel"
        placeholder="Mobile number"
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
        disabled={disabled}
        maxLength={10}
        inputMode="numeric"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="flex-1"
      />
      {error && (
        <p id={errorId} className="absolute bottom-[-20px] left-0 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}