import Link from 'next/link';

import { NAV_TABS } from './data';
import {
  LANDING_HEADER_CTA,
  LANDING_HEADER_CTA_COMPACT,
  LANDING_HEADER_SIGN_IN,
} from './shared';

/**
 * Sticky public navbar for the landing page.
 *
 * Anchor tabs (Features / About / Platforms / Workflow / Standards / FAQ /
 * Contact) smooth-scroll to sections on the SAME "/" page — no new routes, so
 * the approved routing matrix is untouched. `scroll-mt` on each section keeps
 * headings clear of this sticky bar.
 *
 * Below the `sm` breakpoint the full actions are hidden (they would crowd the
 * anchors), so a compact primary CTA is shown instead — previously a phone
 * visitor had NO header entry point at all.
 */
export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-slate-950/60 shadow-[0_1px_0_0_rgb(255_255_255/0.04),0_8px_24px_-16px_rgb(2_6_23/0.8)] backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/50">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6">
        <Link
          href="#top"
          className="shrink-0 text-xl font-bold tracking-tight text-slate-100 transition-opacity duration-200 hover:opacity-90"
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
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors duration-200 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <Link
          href="/register"
          className={`${LANDING_HEADER_CTA_COMPACT} shrink-0 sm:hidden`}
        >
          Start free
        </Link>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Link href="/login" className={LANDING_HEADER_SIGN_IN}>
            Sign in
          </Link>
          <Link href="/register" className={LANDING_HEADER_CTA}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
