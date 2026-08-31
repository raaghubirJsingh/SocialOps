'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

/**
 * Application sidebar.
 *
 * The foundation lists only the routes that actually exist. Per the
 * task, fake business routes (/content, /tasks, /publishing, etc.)
 * are explicitly forbidden - they belong to deferred modules.
 *
 * The sidebar is NOT a security boundary. AGENTS.md §7 makes server-
 * side authorization authoritative; any role-based filtering here
 * would be a UX convenience only. The bootstrap intentionally avoids
 * this because the backend has no `GET /me` endpoint that returns the
 * caller's role without an `X-Organization-Id` header.
 */

const ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
}> = [
  {
    href: '/',
    label: 'Dashboard',
    description: 'Application entry point and overview',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900 md:flex md:flex-col"
      aria-label="Primary navigation"
    >
      <div className="border-b border-slate-800 px-6 py-5">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-slate-100"
        >
          Social<span className="text-blue-400">Ops</span>
        </Link>
        <p className="mt-1 text-xs text-slate-500">
          Social media operations
        </p>
      </div>
      <nav className="flex-1 px-3 py-5">
        <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Workspace
        </p>
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-500/10 font-medium text-blue-300'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Foundation
        </p>
        <p className="px-3 text-xs text-slate-500">
          Auth, RBAC, and dashboard foundations only. Later modules
          will be added after explicit approval.
        </p>
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="text-xs font-medium text-slate-300">SocialOps V1</p>
        <p className="mt-1 text-xs text-slate-500">
          Frontend foundation
        </p>
      </div>
    </aside>
  );
}
