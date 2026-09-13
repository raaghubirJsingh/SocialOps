import type { Metadata } from 'next';

import { LandingNavbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { AboutSection } from '@/components/landing/about';
import { PlatformsSection } from '@/components/landing/platforms';
import { WorkflowSection } from '@/components/landing/workflow';
import { AudienceSection } from '@/components/landing/audience';
import { ReviewsSection } from '@/components/landing/reviews';
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
 * Single-page informational landing: sticky anchor tabs (About /
 * Platforms / Workflow / Reviews / FAQ / Contact) smooth-scroll to
 * sections on THIS page. No new routes — "/" never redirects and never
 * renders the dashboard. Entry points remain /register and /login.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <LandingNavbar />
      <Hero />
      <AboutSection />
      <PlatformsSection />
      <WorkflowSection />
      <AudienceSection />
      <ReviewsSection />
      <FaqSection />
      <ContactSection />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
