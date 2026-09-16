import type { Metadata } from 'next';

import { LandingNavbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { FeaturesSection } from '@/components/landing/features';
import { AboutSection } from '@/components/landing/about';
import { PlatformsSection } from '@/components/landing/platforms';
import { WorkflowSection } from '@/components/landing/workflow';
import { AudienceSection } from '@/components/landing/audience';
import { StandardsSection } from '@/components/landing/standards';
import { FaqSection } from '@/components/landing/faq';
import { ContactSection } from '@/components/landing/contact';
import { FinalCta } from '@/components/landing/final-cta';
import { LandingFooter } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'SocialOps — AI-assisted social media operations',
  description:
    'One Story → Multiple Formats → Multiple Platforms → Multiple Revenue Streams → Permanent Knowledge Base.',
};

/**
 * Public home route — the ONLY "/" route (approved routing matrix).
 *
 * Single-page informational landing: sticky anchor tabs (Features / About /
 * Platforms / Workflow / Standards / FAQ / Contact) smooth-scroll to sections on
 * THIS page. No new routes — "/" never redirects and never renders the
 * dashboard. Entry points remain /register and /login.
 *
 * Section order follows the standard SaaS narrative: promise (hero) → what is
 * enforced (features) → what we are (about) → scope (platforms) → how it works
 * (workflow) → who it is for (audience) → standards → FAQ → contact → CTA.
 */
export default function HomePage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <LandingNavbar />
      <Hero />
      <FeaturesSection />
      <AboutSection />
      <PlatformsSection />
      <WorkflowSection />
      <AudienceSection />
      <StandardsSection />
      <FaqSection />
      <ContactSection />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
