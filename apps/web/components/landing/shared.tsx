import type { ReactNode } from 'react';

/** Shared section heading: eyebrow + title + intro, centered. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-pretty leading-relaxed text-slate-400">{intro}</p>
    </div>
  );
}

/**
 * Shared landing button styles.
 *
 * The landing page previously hand-rolled these classes in four separate files
 * (navbar, hero, audience, final-cta), which drifted apart over time. They now
 * live in one place so the primary and secondary affordances stay identical
 * everywhere.
 *
 * They are plain class strings rather than a component, so existing markup and
 * static rendering stay exactly as they are.
 */
export const LANDING_BUTTON_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition-all duration-200 hover:bg-blue-500 hover:shadow-2xl hover:shadow-blue-500/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export const LANDING_BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-7 py-3.5 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-slate-500 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export const LANDING_HEADER_SIGN_IN =
  'rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60';

export const LANDING_HEADER_CTA =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

/**
 * Compact header CTA used below the `sm` breakpoint, where the full-width
 * actions are hidden. Without it a phone visitor saw NO header entry point at
 * all (the hero CTA was the only one reachable without scrolling).
 */
export const LANDING_HEADER_CTA_COMPACT =
  'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70';

/** Shared card shell matching the existing shadcn-style dark theme. */
export function LandingCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`surface-glass rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30 hover:bg-white/[0.06] ${className}`}
    >
      {children}
    </div>
  );
}
