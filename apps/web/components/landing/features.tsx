import {
  BadgeCheck,
  History,
  KeyRound,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { LIVE_TODAY, NEXT_PHASES } from './data';
import { LandingCard, SectionHeading } from './shared';

/**
 * The three rules this product actually enforces, in the code and in the
 * database. Each card states the benefit first, then HOW it is enforced, so no
 * claim has to be taken on faith.
 */
const PRIMARY_CAPABILITIES = [
  {
    icon: Lock,
    title: 'Client-owner final confirmation',
    body: 'Only the client owner can approve. Their approval records the exact text as an immutable revision with a SHA-256 digest — and a database constraint refuses any approved item that is missing it.',
  },
  {
    icon: ShieldCheck,
    title: 'Strict tenant isolation',
    body: 'Your organization is the boundary. Every client-owned row carries a non-nullable client id, agencies must hold an ACTIVE relationship to see a client, and out-of-scope reads answer one uniform 404.',
  },
  {
    icon: KeyRound,
    title: 'Metadata-only security',
    body: 'No social password. No access token. No refresh token — this phase never asks for or stores them, so there is nothing to leak while platform connections remain deferred.',
  },
] as const;

const SUPPORTING_CAPABILITIES = [
  {
    icon: BadgeCheck,
    title: 'Approval gates everything',
    body: 'Approval is a mandatory, recorded stage. Nothing can be treated as ready without a confirmation attached to a specific revision.',
  },
  {
    icon: History,
    title: 'Insert-only audit trail',
    body: 'Revisions and status changes are append-only. Editing an approved item returns it to Draft and clears the confirmation — visibly, in the trail.',
  },
  {
    icon: Users,
    title: 'Role-based access',
    body: 'Owner, Admin, Member and Viewer per organization membership, re-verified server-side on every request. Hiding a button is never the control.',
  },
] as const;

/**
 * Features section (`#features`).
 *
 * Showcases the business rules that are implemented and verified today. It
 * deliberately ends with a live-vs-next strip: the platforms, publishing and
 * analytics modules are still deferred, and the page must not imply otherwise
 * (AGENTS.md §14).
 */
export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative isolate scroll-mt-20 overflow-hidden border-y border-white/[0.06] bg-white/[0.02]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top_right,rgb(37_99_235/0.10),transparent_55%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="What we enforce"
          title="Approvals you can prove. Isolation you can trust."
          intro="Three rules are enforced by the API and the database — not merely by the interface. Everything else SocialOps does follows from them."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PRIMARY_CAPABILITIES.map((capability) => (
            <LandingCard
              key={capability.title}
              className="group relative overflow-hidden border-blue-500/20 hover:border-blue-500/40"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-600/10 blur-2xl"
              />
              <capability.icon
                className="h-9 w-9 text-blue-400 transition-transform duration-300 group-hover:scale-105"
                aria-hidden="true"
              />
              <h3 className="mt-4 text-lg font-semibold text-slate-100">
                {capability.title}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-400">
                {capability.body}
              </p>
            </LandingCard>
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {SUPPORTING_CAPABILITIES.map((capability) => (
            <LandingCard key={capability.title} className="group">
              <capability.icon
                className="h-7 w-7 text-cyan-300 transition-transform duration-300 group-hover:scale-105"
                aria-hidden="true"
              />
              <h3 className="mt-3 font-semibold text-slate-100">
                {capability.title}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-400">
                {capability.body}
              </p>
            </LandingCard>
          ))}
        </div>

        {/* Live vs next — keeps the page honest about deferred modules. */}
        <div className="surface-glass mt-10 grid gap-6 rounded-2xl p-6 md:grid-cols-2">
          <div>
            <Badge variant="success">Live today</Badge>
            <ul className="mt-4 space-y-2">
              {LIVE_TODAY.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-slate-300"
                >
                  <span aria-hidden="true" className="text-emerald-400">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Badge variant="warning">Next approved phases</Badge>
            <ul className="mt-4 space-y-2">
              {NEXT_PHASES.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-slate-400"
                >
                  <span aria-hidden="true" className="text-amber-400">
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Each of these ships only after its own explicit approval. We would
              rather list them honestly than claim them early.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}