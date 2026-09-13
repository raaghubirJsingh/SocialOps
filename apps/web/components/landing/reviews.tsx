import { Star } from 'lucide-react';

import { REVIEWS } from './data';
import { SectionHeading } from './shared';

function Stars({ count }: { count: number }) {
  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={`Rated ${count} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`h-4 w-4 ${
            i < count ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Reviews section (`#reviews`).
 * AGENTS.md §14 forbids inventing business data, so the header carries
 * an explicit "illustrative sample" disclaimer until real testimonials
 * exist post-launch.
 */
export function ReviewsSection() {
  return (
    <section id="reviews" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Reviews"
          title="Loved by teams who hate chaos"
          intro="A sample of what early users say about working the SocialOps way."
        />
        <p className="mx-auto mt-3 w-fit rounded-full border border-slate-800 bg-slate-900/60 px-4 py-1 text-[11px] text-slate-500">
          Illustrative sample reviews — real customer testimonials will
          appear here after launch.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {REVIEWS.map((review) => (
            <figure
              key={review.name}
              className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition-all hover:-translate-y-1 hover:border-slate-600 hover:shadow-xl hover:shadow-blue-950/40"
            >
              <Stars count={review.stars} />
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-300">
                &ldquo;{review.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-800 pt-4">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-600 text-xs font-bold text-white"
                >
                  {review.initials}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-100">
                    {review.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {review.role}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
