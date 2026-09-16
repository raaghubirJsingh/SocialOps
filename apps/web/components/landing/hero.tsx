import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

import { HERO_STATS } from './data';
import { LANDING_BUTTON_PRIMARY, LANDING_BUTTON_SECONDARY } from './shared';

/**
 * Hero — the "stop and stare" first viewport.
 *
 * Layered radial glows + grid pattern over the slate-950 base, gradient
 * headline, philosophy strip, dual CTA and an honest stats row (only
 * real foundation facts — no invented user counts per AGENTS.md §14).
 */
export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      {/* Ambient background: layered radial glows + faint grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.14),transparent_60%)]" />
        <div className="absolute -top-32 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute -left-40 top-40 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="absolute -right-40 top-64 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="bg-grid-faint absolute inset-0 opacity-[0.14]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <p className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-300 shadow-lg shadow-blue-600/10 backdrop-blur-sm">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-blue-400 motion-safe:animate-pulse"
          />
          AI-assisted social media operations
        </p>

        <h1 className="mt-6 max-w-3xl text-balance text-4xl font-extrabold leading-[1.03] tracking-tight text-white sm:text-6xl">
          One story.
          <br />
          <span className="bg-linear-to-r from-blue-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            Every platform. Zero chaos.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300">
          SocialOps turns a single idea into reviewed and approved content
          prepared for Instagram, Facebook and YouTube — with human sign-off at
          every gate and AI assistance arriving in later approved phases.
        </p>

        <p className="mt-6 max-w-2xl border-l-2 border-blue-500/60 pl-4 font-medium text-slate-200">
          One Story → Multiple Formats → Multiple Platforms → Multiple
          Revenue Streams → Permanent Knowledge Base.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/register" className={`group ${LANDING_BUTTON_PRIMARY}`}>
            Start free today
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
          <a href="#features" className={LANDING_BUTTON_SECONDARY}>
            See what we enforce
          </a>
        </div>

        <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          Human approval is a mandatory, recorded gate — nothing can be marked
          approved without it.
        </p>

        {/* Honest stats — foundation facts only */}
        <dl className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {HERO_STATS.map((stat) => (
            <div
              key={stat.label}
              className="surface-glass rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30"
            >
              <dt className="order-2 mt-1 text-xs leading-snug text-slate-400">
                {stat.label}
              </dt>
              <dd className="bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-3xl font-extrabold tabular-nums text-transparent">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Scope of the V1 design — not shipped integrations. Live today:
          accounts &amp; roles, client onboarding, content review &amp; final
          approval.
        </p>
      </div>
    </section>
  );
}
