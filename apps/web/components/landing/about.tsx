import { ClipboardCheck, Layers, Users } from 'lucide-react';

import { LandingCard, SectionHeading } from './shared';

const ABOUT_CARDS = [
  {
    icon: Layers,
    title: 'One workflow, end to end',
    body: 'Every client engagement travels a single operational pipeline — from commitment to report — instead of scattering across chats, sheets and inboxes.',
  },
  {
    icon: ClipboardCheck,
    title: 'Human control, AI assistance',
    body: 'Human review and approval are built today and stay mandatory at every gate. AI is designed to draft, repurpose and remind — arriving only in an explicitly approved phase.',
  },
  {
    icon: Users,
    title: 'Teams with clear boundaries',
    body: 'Organization-level tenancy with Owner, Admin, Member and Viewer roles. Server-side authorization on every request — the UI only hides buttons for convenience.',
  },
];

/** About section (`#about`): what SocialOps is and what it provides. */
export function AboutSection() {
  return (
    <section id="about" className="relative isolate scroll-mt-20 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-1/3 h-72 bg-[radial-gradient(ellipse_at_center,rgb(37_99_235/0.07),transparent_60%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="About SocialOps"
          title="Operations, not just posting"
          intro="SocialOps is a scalable, AI-assisted Social Media Operations Management System. It exists to remove repetitive operational work while preserving editorial quality, consistency, auditability and scale."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ABOUT_CARDS.map((card) => (
            <LandingCard key={card.title} className="group">
              <card.icon
                className="h-8 w-8 text-blue-400 transition-transform duration-300 group-hover:scale-105"
                aria-hidden="true"
              />
              <h3 className="mt-4 text-lg font-semibold text-slate-100">
                {card.title}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-400">
                {card.body}
              </p>
            </LandingCard>
          ))}
        </div>
      </div>
    </section>
  );
}
