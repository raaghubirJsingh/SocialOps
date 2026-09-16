import { CAPABILITIES } from './data';
import { LandingCard, SectionHeading } from './shared';

/**
 * Standards section (`#standards`) — REPLACES the earlier testimonials section.
 *
 * Approved decision F2: showing named people with star ratings implied real
 * customer proof that does not exist for a pre-launch product. The section now
 * states what SocialOps guarantees and how, using only claims that are
 * verifiable in this repository (see docs/APPROVED_DECISIONS.md Decisions 006,
 * 008 and 009, plus the integration specs under apps/api/test).
 *
 * Real testimonials can return here once there are real customers — the
 * component is a single array swap in `./data`.
 */
export function StandardsSection() {
  return (
    <section id="standards" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Standards"
          title="Built to be trusted, not just demoed"
          intro="Six commitments that already hold — with the enforcement behind each one, so you can check rather than take our word for it."
        />

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <LandingCard key={capability.title} className="flex flex-col">
              <h3 className="text-lg font-semibold text-slate-100">
                {capability.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">
                {capability.body}
              </p>
            </LandingCard>
          ))}
        </div>

        <p className="mx-auto mt-10 w-fit rounded-full border border-slate-800 bg-slate-900/60 px-4 py-1 text-[11px] text-slate-500">
          Every claim above is enforced in code and covered by tests — not
          marketing copy.
        </p>
      </div>
    </section>
  );
}