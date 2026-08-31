'use client';

import { usePathname } from 'next/navigation';

import { UserMenu } from '@/components/layout/user-menu';

/**
 * Application top bar.
 *
 * Renders the current section title (derived from the active route)
 * and the user menu.
 */
const TITLES: Record<string, string> = {
  '/': 'Dashboard',
};

function deriveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/login')) return 'Sign in';
  return 'SocialOps';
}

export function Topbar() {
  const pathname = usePathname();
  const title = deriveTitle(pathname);
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6">
      <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
      <UserMenu />
    </header>
  );
}
