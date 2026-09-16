import { ArrowRight, AtSign, Building2 } from 'lucide-react';
import Link from 'next/link';

import { LandingCard, LANDING_BUTTON_PRIMARY, SectionHeading } from './shared';

/**
 * Audience section: the two AGENTS.md §17.1 account types.
 * Mirrors the exact registration labels (Service Provider /
 * Individual-Business) so the landing page never contradicts /register.
 */
export function AudienceSection() {
  return (
    <section className="relative isolate overflow-hidden border-y border-white/[0.06] bg-linear-to-b from-blue-950/40 to-slate-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.10),transparent_60%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Who is it for"
          title="Two ways to use SocialOps"
          intro="Registration asks exactly one question about intent — and routes everything else from that answer."
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <LandingCard className="group border-blue-500/25 bg-linear-to-b from-blue-950/50 to-slate-900/60 hover:border-blue-400/50">
            <Building2
              className="h-8 w-8 text-blue-400 transition-transform duration-300 group-hover:scale-105"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-lg font-semibold text-slate-100">
              Service Provider
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              You handle social media for other people or businesses. Onboard
              each client, link them to your agency, and run every piece of
              content through review and client-owner approval. Workspaces, task
              assignment and reporting are future phases.
            </p>
          </LandingCard>
          <LandingCard className="group">
            <AtSign
              className="h-8 w-8 text-cyan-300 transition-transform duration-300 group-hover:scale-105"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-lg font-semibold text-slate-100">
              Individual / Business
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              You manage your own accounts. Record the platforms you operate,
              draft your content, and keep a permanent, auditable history of
              what was approved and why.
            </p>
          </LandingCard>
        </div>
        <div className="mt-10 text-center">
          <Link href="/register" className={LANDING_BUTTON_PRIMARY}>
            Choose your path — register free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
