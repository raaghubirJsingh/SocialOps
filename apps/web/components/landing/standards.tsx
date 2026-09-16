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
    <section
      id="standards"
      className="relative isolate scroll-mt-20 overflow-hidden border-y border-white/[0.06] bg-white/[0.02]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top_left,rgb(37_99_235/0.09),transparent_55%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
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

        <p className="surface-panel mx-auto mt-10 w-fit rounded-full px-4 py-1 text-[11px] text-slate-400">
          Every claim above is enforced in code and covered by tests — not
          marketing copy.
        </p>
      </div>
    </section>
  );
}