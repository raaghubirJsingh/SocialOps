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
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 leading-relaxed text-slate-400">{intro}</p>
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
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition-colors hover:bg-blue-500';

export const LANDING_BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-7 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white';

export const LANDING_HEADER_SIGN_IN =
  'rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white';

export const LANDING_HEADER_CTA =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500';

/**
 * Compact header CTA used below the `sm` breakpoint, where the full-width
 * actions are hidden. Without it a phone visitor saw NO header entry point at
 * all (the hero CTA was the only one reachable without scrolling).
 */
export const LANDING_HEADER_CTA_COMPACT =
  'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500';

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
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition-colors hover:border-slate-700 ${className}`}
    >
      {children}
    </div>
  );
}
