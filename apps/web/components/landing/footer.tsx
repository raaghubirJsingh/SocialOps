import Link from 'next/link';

import { NAV_TABS } from './data';

/** Footer: anchor links + honest foundation note. */
export function LandingFooter() {
  return (
    <footer className="border-t border-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xl font-bold tracking-tight text-slate-100">
          Social<span className="text-blue-400">Ops</span>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {NAV_TABS.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className="text-xs text-slate-500 transition-colors hover:text-slate-200"
            >
              {tab.label}
            </a>
          ))}
          <Link
            href="/register"
            className="text-xs text-slate-500 transition-colors hover:text-slate-200"
          >
            Register
          </Link>
          <Link
            href="/login"
            className="text-xs text-slate-500 transition-colors hover:text-slate-200"
          >
            Sign in
          </Link>
        </nav>
      </div>
      <div className="border-t border-slate-800/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-slate-600">
            SocialOps V1 — live today: accounts &amp; roles, client onboarding,
            agency↔client linking, content review &amp; final approval, intake
            records. Further modules ship only after explicit approval.
          </p>
          <p className="text-xs text-slate-600">© 2026 SocialOps</p>
        </div>
      </div>
    </footer>
  );
}
