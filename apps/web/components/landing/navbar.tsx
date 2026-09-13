import Link from 'next/link';

import { NAV_TABS } from './data';

/**
 * Sticky public navbar for the landing page.
 *
 * Anchor tabs (About / Platforms / Workflow / Reviews / FAQ / Contact)
 * smooth-scroll to sections on the SAME "/" page — no new routes, so the
 * approved routing matrix is untouched. `scroll-mt` on each section keeps
 * headings clear of this sticky bar.
 */
export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6">
        <Link
          href="#top"
          className="shrink-0 text-xl font-bold tracking-tight text-slate-100"
        >
          Social<span className="text-blue-400">Ops</span>
        </Link>

        <nav
          aria-label="Page sections"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {NAV_TABS.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-100"
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
