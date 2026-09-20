'use client';

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SELECT_CLASSES, Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-400">{message}</p>;
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, required, ...rest }: TextFieldProps) {
  const fieldId = id ?? `rd-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      <Input id={fieldId} aria-invalid={Boolean(error)} {...rest} />
      <FieldError message={error} />
    </div>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function TextareaField({ label, error, id, required, ...rest }: TextareaFieldProps) {
  const fieldId = id ?? `rd-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      <Textarea id={fieldId} aria-invalid={Boolean(error)} {...rest} />
      <FieldError message={error} />
    </div>
  );
}

interface SingleSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly string[];
  error?: string;
  placeholder?: string;
}

export function SingleSelect({ label, options, error, id, required, placeholder, ...rest }: SingleSelectProps) {
  const fieldId = id ?? `rd-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      <select id={fieldId} className={SELECT_CLASSES} aria-invalid={Boolean(error)} {...rest}>
        <option value="">{placeholder ?? 'Select…'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

interface MultiSelectChipsProps {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
  required?: boolean;
}

export function MultiSelectChips({ label, options, value, onChange, error, required }: MultiSelectChipsProps) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-slate-200">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(opt)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500',
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}
