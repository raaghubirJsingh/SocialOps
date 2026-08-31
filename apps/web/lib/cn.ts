import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Standard shadcn-style className merger.
 *
 * Combines clsx (conditional class lists) with tailwind-merge
 * (Tailwind class deduplication).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
