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
    <section className="border-y border-slate-800/80 bg-gradient-to-b from-blue-950/40 to-slate-950">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Who is it for"
          title="Two ways to use SocialOps"
          intro="Registration asks exactly one question about intent — and routes everything else from that answer."
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <LandingCard className="border-blue-500/20 bg-gradient-to-b from-blue-950/50 to-slate-900/60">
            <Building2
              className="h-8 w-8 text-blue-400"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-lg font-semibold text-slate-100">
              Service Provider
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              You handle social media for other people or businesses. Run
              every client as a workspace, assign work to your team, and
              send reports clients actually read.
            </p>
          </LandingCard>
          <LandingCard>
            <AtSign className="h-8 w-8 text-cyan-300" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-100">
              Individual / Business
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              You manage your own accounts. Plan once, publish
              consistently, and keep a permanent knowledge base of
              everything you created.
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
