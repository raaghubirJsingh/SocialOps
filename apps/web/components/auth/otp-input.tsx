'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 6-digit OTP input component with auto-advance and paste support.
 *
 * Renders a single input that accepts exactly 6 digits. The value is
 * exposed as a string (leading zeros preserved).
 */
interface OtpInputProps {
  /** Current OTP value (6 digits). */
  value: string;
  /** Called when the OTP value changes. */
  onChange: (value: string) => void;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Error message to display below the input. */
  error?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Label text. */
  label?: string;
}

export function OtpInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  error,
  placeholder = '••••••',
  label = '6-digit code',
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(value);

  // Sync display value with prop value
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value.replace(/\D/g, '').slice(0, 6);
      setDisplayValue(newValue);
      onChange(newValue);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow navigation keys
      if (
        ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)
      ) {
        return;
      }
      // Block non-digit keys
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    },
    [],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      setDisplayValue(pasted);
      onChange(pasted);
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor="otp">{label}</Label>
      <Input
        ref={inputRef}
        id="otp"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder={placeholder}
        className="text-center text-2xl tracking-widest font-mono"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'otp-error' : undefined}
      />
      {error && (
        <p id="otp-error" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}