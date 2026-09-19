'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { useSession } from '@/hooks/use-session';

/**
 * Application sidebar.
 *
 * Persona-aware navigation (the item arrays are exported for contract
 * tests). The sidebar is NOT a security boundary — AGENTS.md §7 keeps
 * server-side authorization authoritative; this is a UX convenience only:
 *   - Agency (SERVICE_PROVIDER): the agency-side /clients surface.
 *   - Client (INDIVIDUAL_BUSINESS, self-registered): their own /client
 *     self-service area. The agency /clients list is hidden — a
 *     self-registered client has no Organization membership and would
 *     only hit the organization-selection dead end.
 *   - Employee (isEmployee): no tenant navigation at all (§17.4).
 * A non-employee session with a null accountType (pre-migration row or a
 * stale localStorage session) degrades to the agency list, matching the
 * pre-persona behavior.
 */

interface NavItem {
  href: string;
  label: string;
  description: string;
}

const DASHBOARD_ITEM: NavItem = {
  href: '/dashboard',
  label: 'Dashboard',
  description: 'Application entry point and overview',
};

export const AGENCY_NAV_ITEMS: readonly NavItem[] = [
  DASHBOARD_ITEM,
  {
    href: '/clients',
    label: 'Clients',
    description: 'Manage client relationships',
  },
];

export const CLIENT_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    description: 'Your account overview',
  },
  {
    href: '/client/profile',
    label: 'My Profile',
    description: 'Your client details and field-change requests',
  },
  {
    href: '/client/social-accounts',
    label: 'Social Accounts',
    description: 'Platforms you operate (metadata only)',
  },
  {
    href: '/client/content',
    label: 'Content',
    description: 'Review and approve content shared with you',
  },
  {
    href: '/client/notifications',
    label: 'Notifications',
    description: 'Events recorded against your profile',
  },
];

export const EMPLOYEE_NAV_ITEMS: readonly NavItem[] = [DASHBOARD_ITEM];

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useSession();
  const isEmployee = session?.user?.isEmployee ?? false;
  const isClientAccount =
    !isEmployee && session?.user?.accountType === 'INDIVIDUAL_BUSINESS';

  const items = isEmployee
    ? EMPLOYEE_NAV_ITEMS
    : isClientAccount
      ? CLIENT_NAV_ITEMS
      : AGENCY_NAV_ITEMS;

  // Longest-prefix active match: `/client/social-accounts` highlights
  // "Social accounts" and NOT also "My client" (`/client`).
  const activeHref = items.reduce<string | null>((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(item.href + '/');
    if (!matches) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  return (
    <aside
      className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-slate-900/40 md:flex md:flex-col"
      aria-label="Primary navigation"
    >
      <div className="border-b border-white/[0.06] px-6 py-5">
        {/* Brand target is /dashboard: "/" is the public home page in the
            approved routing matrix, so the in-app brand link stays inside
            the protected area. */}
        <Link
          href="/dashboard"
          className="inline-block rounded text-xl font-bold tracking-tight text-slate-100 transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          Social<span className="text-blue-400">Ops</span>
        </Link>
        <p className="mt-1 text-xs text-slate-400">
          Social media operations
        </p>
      </div>
      <nav className="flex-1 px-3 py-5">
        <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Workspace
        </p>
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.description}
                  className={cn(
                    'block rounded-lg border-l-2 px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60',
                    isActive
                      ? 'border-blue-400/70 bg-blue-500/10 font-medium text-blue-300'
                      : 'border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-slate-100',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Foundation
        </p>
        <p className="px-3 text-xs text-slate-400">
          Auth, RBAC, and dashboard foundations only. Later modules
          will be added after explicit approval.
        </p>
      </nav>
      <div className="border-t border-white/[0.06] p-4">
        <p className="text-xs font-medium text-slate-300">SocialOps V1</p>
        <p className="mt-1 text-xs text-slate-400">
          Frontend foundation
        </p>
      </div>
    </aside>
  );
}
