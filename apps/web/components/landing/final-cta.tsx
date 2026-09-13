import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const TRUST_POINTS = [
  'Organization-level tenancy',
  'Role-based access, enforced server-side',
  'Auditable operations at every stage',
];

/** Final CTA band above the footer. */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-slate-800/80">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-72 w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/15 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Stop juggling chats.{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
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
          <Link
            href="/register"
            className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition-colors hover:bg-blue-500"
          >
            Register
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-700 bg-slate-900/60 px-7 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Free during the foundation phase — no credit card, no sales call.
        </p>
      </div>
    </section>
  );
}
