'use client';

import { usePathname } from 'next/navigation';

import { UserMenu } from '@/components/layout/user-menu';

/**
 * Application top bar.
 *
 * Sticky and glass, mirroring the landing navbar's recipe exactly (explicit
 * utilities rather than `surface-glass`, which hard-codes a 1px border on all
 * four sides - wrong for an edge-anchored bar, and overriding it with
 * border-b/border-x-0 is emit-order dependent, the same hazard documented in
 * globals.css). This is the only persistent app-wide blur: see the APP-SIDE
 * BLUR BUDGET.
 */
const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/60 px-6 shadow-[0_1px_0_0_rgb(255_255_255/0.04),0_8px_24px_-16px_rgb(2_6_23/0.8)] backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/50">
      <h1 className="text-lg font-semibold tracking-tight text-slate-100">
        {title}
      </h1>
      <UserMenu />
    </header>
  );
}
