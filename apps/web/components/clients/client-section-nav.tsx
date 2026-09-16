'use client';

import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Agency-side section navigation for one Client (Client Operations V1).
 *
 * Plain Tailwind links - deliberately not a tabs primitive, because the
 * project has no tabs component and adding one is not justified for two
 * destinations. `clientId` is carried in the path, never as editable state.
 */
const SECTIONS = [
  { href: '', label: 'Overview' },
  { href: '/social-accounts', label: 'Social accounts' },
  { href: '/content', label: 'Content' },
] as const;

export function ClientSectionNav({
  clientId,
  active,
}: {
  clientId: string;
  active: 'overview' | 'social-accounts' | 'content';
}) {
  return (
    <nav aria-label="Client sections" className="flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
        const key = section.href === '' ? 'overview' : section.href.slice(1);
        const isActive = key === active;
        return (
          <Link
            key={section.label}
            href={`/clients/${clientId}${section.href}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-blue-500/10 font-medium text-blue-300'
                : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}