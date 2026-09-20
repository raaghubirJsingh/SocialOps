'use client';

import { WIZARD_STEPS } from '@/types/raw-data';
import { cn } from '@/lib/cn';

interface WizardStepperProps {
  active: number;
  visited: boolean[];
  onJump: (index: number) => void;
}

export function WizardStepper({ active, visited, onJump }: WizardStepperProps) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Request steps">
      {WIZARD_STEPS.map((label, i) => {
        const isActive = i === active;
        const canJump = visited[i] && i !== active;
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!canJump}
              onClick={() => onJump(i)}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs',
                isActive
                  ? 'border-blue-500 bg-blue-600/20 text-blue-100'
                  : visited[i]
                    ? 'border-slate-600 bg-slate-800 text-slate-200'
                    : 'border-slate-800 bg-slate-900 text-slate-500',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200',
                )}
              >
                {i + 1}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
