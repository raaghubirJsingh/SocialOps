import { FAQS } from './data';
import { SectionHeading } from './shared';

/**
 * FAQ section (`#faq`) — dependency-free accordion using
 * native <details>/<summary> (no new library per frozen stack).
 */
export function FaqSection() {
  return (
    <section
      id="faq"
      className="scroll-mt-20 border-y border-slate-800/80 bg-slate-900/30"
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered honestly"
          intro="No marketing fog. If something is not built yet, we say so."
        />
        <div className="mt-10 space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-4 transition-colors open:border-blue-500/40 hover:border-slate-700"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition-transform group-open:rotate-45 group-open:border-blue-500/50 group-open:text-blue-300"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
