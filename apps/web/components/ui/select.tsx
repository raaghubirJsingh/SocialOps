import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  showOtherOption?: boolean;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  className,
  showOtherOption = false,
  otherValue = '',
  onOtherChange,
}: SelectProps) {
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={className}>
      {label && (
        <Label className="text-sm text-slate-300">{label}</Label>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="w-full justify-start text-left font-normal"
          >
            <span className="flex-1 text-slate-100">
              {displayValue}
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
        <DropdownMenuContent align="start" className="w-full">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className="cursor-pointer"
            >
              {option.label}
              {value === option.value && (
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
          {showOtherOption && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onChange('Other')}
                className="cursor-pointer"
              >
                Other
                {value === 'Other' && (
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showOtherOption && value === 'Other' && onOtherChange && (
        <div className="mt-2">
          <Input
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Specify your industry..."
          />
        </div>
      )}
    </div>
  );
}
