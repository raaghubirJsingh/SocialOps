import * as React from 'react';

import { cn } from '@/lib/cn';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea primitive.
 *
 * Styling mirrors `input.tsx` so multi-line fields (Content body, RawData
 * intake) match the existing form controls exactly. No new dependency.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors duration-200 hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 aria-invalid:border-red-800/70 aria-invalid:focus-visible:ring-red-400/60 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

/**
 * Shared `<select>` styling.
 *
 * There is no Radix select in this project (AGENTS.md: no new libraries
 * without approval), so plain `<select>` elements are styled with these
 * classes - the same approach `create-client-form.tsx` already uses.
 *
 * Note: this is the single source of truth for select styling. Callers must
 * import it rather than re-declaring the string locally (create-client-form.tsx
 * previously duplicated it, which let the two drift apart).
 */
export const SELECT_CLASSES =
  'flex h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 transition-colors duration-200 hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 aria-invalid:border-red-800/70 aria-invalid:focus-visible:ring-red-400/60 disabled:cursor-not-allowed disabled:opacity-50';