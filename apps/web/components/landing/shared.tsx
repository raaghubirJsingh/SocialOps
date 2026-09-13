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
