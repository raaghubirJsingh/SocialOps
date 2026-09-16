import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { LANDING_BUTTON_PRIMARY, LANDING_BUTTON_SECONDARY } from './shared';

const TRUST_POINTS = [
  'Organization-level tenancy',
  'Role-based access, enforced server-side',
  'Auditable operations at every stage',
];

/** Final CTA band above the footer. */
export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden border-t border-white/[0.06]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_at_center,rgb(37_99_235/0.12),transparent_60%)]" />
        <div className="absolute left-1/2 top-1/2 h-72 w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/12 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl px-6 py-20 text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Stop juggling chats.{' '}
          <span className="bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Start operating.
          </span>
        </h2>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="inline-flex items-center gap-2">
              <CheckCircle2
                className="h-4 w-4 text-emerald-400"
                aria-hidden="true"
              />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/register" className={LANDING_BUTTON_PRIMARY}>
            Register
          </Link>
          <Link href="/login" className={LANDING_BUTTON_SECONDARY}>
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          Start free while SocialOps is in its foundation phase.
        </p>
      </div>
    </section>
  );
}
