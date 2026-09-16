import Link from 'next/link';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

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
    <section id="top" className="relative overflow-hidden">
      {/* Ambient background: glows + grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -left-40 top-40 h-72 w-72 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute -right-40 top-64 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(148 163 184 / 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.25) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage:
              'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <p className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          AI-assisted social media operations
        </p>

        <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
          One story.
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            Every platform. Zero chaos.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
          SocialOps turns a single idea into reviewed, approved, published
          content across Instagram, Facebook and YouTube — with humans in
          control and AI doing the repetitive heavy lifting.
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
          Human approval required before anything is published — always.
        </p>

        {/* Honest stats — foundation facts only */}
        <dl className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {HERO_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-colors hover:border-slate-700"
            >
              <dt className="order-2 mt-1 text-xs leading-snug text-slate-500">
                {stat.label}
              </dt>
              <dd className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-3xl font-extrabold text-transparent">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
