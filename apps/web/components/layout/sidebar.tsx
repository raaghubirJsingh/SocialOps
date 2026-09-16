'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { useSession } from '@/hooks/use-session';

/**
 * Application sidebar.
 *
 * The foundation lists only the routes that actually exist. Per the
 * task, fake business routes (/content, /tasks, /publishing, etc.)
 * are explicitly forbidden - they belong to deferred modules.
 *
 * The sidebar is NOT a security boundary. AGENTS.md §7 makes server-
 * side authorization authoritative; this is a UX convenience only.
 */

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
  hiddenForEmployees?: boolean;
}> = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Application entry point and overview',
  },
  {
    href: '/clients',
    label: 'Clients',
    description: 'Manage client relationships',
    hiddenForEmployees: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useSession();
  const isEmployee = session?.user?.isEmployee ?? false;

  // Employees are not Organization members and must not see the
  // Service Provider /clients navigation (AGENTS.md §6). This is a
  // UX convenience only — the backend enforces the real boundary.
  const items = isEmployee
    ? NAV_ITEMS.filter((item) => !item.hiddenForEmployees)
    : NAV_ITEMS;

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
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
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
