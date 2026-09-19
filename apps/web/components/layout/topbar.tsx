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
  '/clients': 'Clients',
  '/client': 'Client dashboard',
  '/client/onboarding': 'Client onboarding',
  '/client/profile': 'Client profile',
  '/client/notifications': 'Notifications',
  '/client/social-accounts': 'Social accounts',
  '/client/content': 'Content',
  '/client/raw-data': 'Raw data',
};

function deriveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  // Longest-prefix match so /client/social-accounts wins over /client, and
  // /clients/… (agency client detail) resolves to "Clients".
  const prefixes = Object.keys(TITLES).filter((key) =>
    pathname.startsWith(key + '/'),
  );
  if (prefixes.length > 0) {
    const best = prefixes.reduce((a, b) => (b.length > a.length ? b : a));
    return TITLES[best];
  }
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
