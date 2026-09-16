import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-slate-700 bg-slate-800 text-slate-300',
        muted: 'border-slate-800 bg-slate-900 text-slate-500',
        info: 'border-blue-900/60 bg-blue-950/40 text-blue-300',
        warning: 'border-amber-900/60 bg-amber-950/40 text-amber-300',
        danger: 'border-rose-900/60 bg-rose-950/40 text-rose-300',
        success: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Small status/label pill (statuses, platforms, actor roles). */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };