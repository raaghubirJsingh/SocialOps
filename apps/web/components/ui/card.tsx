import * as React from 'react';

import { cn } from '@/lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Surface treatment. Exactly one is applied, never both.
   *
   * - `panel` (default): no backdrop blur - the surface for every data grid,
   *   list, table and form card.
   * - `glass`: adds `backdrop-filter`. Reserved for the budgeted exceptions
   *   documented in globals.css (the auth card, the /dashboard API-status
   *   card). Before using it, check the APP-SIDE BLUR BUDGET note.
   *
   * This is a prop rather than a `className` addition on purpose: the two
   * surface utilities conflict on border-color/background-color and Tailwind's
   * emit order for custom @utility rules is not author-controlled, so stacking
   * them would fail silently.
   */
  surface?: 'panel' | 'glass';
}

const CARD_SURFACES = {
  panel: 'surface-panel',
  glass: 'surface-glass',
} as const;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, surface = 'panel', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(CARD_SURFACES[surface], 'rounded-xl text-slate-100', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-400', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';
