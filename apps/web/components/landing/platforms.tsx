import { Facebook, Instagram, Youtube } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { LandingCard, SectionHeading } from './shared';

/**
 * Platform cards.
 *
 * Copy aligned with what V1 actually does today: content is drafted, reviewed
 * and approved per platform — platform CONNECTIONS and analytics are still
 * deferred, so nothing here claims them (approved copy pass; AGENTS.md §14).
 */
const PLATFORM_CARDS = [
  {
    icon: Instagram,
    name: 'Instagram',
    body: 'Reels, posts and stories flow through the same review and approval pipeline — one approval covers every format.',
  },
  {
    icon: Facebook,
    name: 'Facebook',
    body: 'Pages and posts stay tied to the same content record, so there is no copy-paste between tools while the work is in review.',
  },
  {
    icon: Youtube,
    name: 'YouTube',
    body: 'Long-form and Shorts ride the same workflow — from draft to an approved revision you can point at and verify.',
  },
] as const;

/**
 * Platforms section (`#platforms`).
 * V1 scope per AGENTS.md §2: Instagram / Facebook / YouTube only.
 * X / WhatsApp are named as explicitly out of scope (honesty > hype).
 */
export function PlatformsSection() {
  return (
    <section
      id="platforms"
      className="scroll-mt-20 border-y border-slate-800/80 bg-slate-900/30"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Platforms"
          title="Built for Instagram, Facebook & YouTube"
          intro="V1 focuses on the three platforms where most client work actually lives. Deeper integrations arrive only in explicitly approved phases."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLATFORM_CARDS.map((platform) => (
            <LandingCard
              key={platform.name}
              className="relative overflow-hidden"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-600/15 blur-2xl"
              />
              <platform.icon
                className="h-9 w-9 text-fuchsia-400"
                aria-hidden="true"
              />
              <h3 className="mt-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
                {platform.name}
                <Badge variant="success">V1</Badge>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {platform.body}
              </p>
            </LandingCard>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-slate-500">
          X (Twitter) and WhatsApp Channels are explicitly out of V1 scope —
          we would rather be honest about three platforms than vague about
          five.
        </p>
      </div>
    </section>
  );
}
