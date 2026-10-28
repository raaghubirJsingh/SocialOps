/**
 * Static content for the public landing page (`/`).
 *
 * All content is presentational and honest about the foundation stage:
 *  - No fake user counts, no fake metrics.
 *  - Platform scope matches AGENTS.md §2 (Instagram / Facebook / YouTube
 *    in V1; X / WhatsApp explicitly out of scope).
 *  - The capabilities section states what the product ENFORCES today, and the
 *    live-vs-next strip names every deferred module explicitly (AGENTS.md §14
 *    forbids inventing business data — real testimonials arrive post-launch).
 */

export interface NavTab {
  label: string;
  href: string;
}

export const NAV_TABS: NavTab[] = [
  { label: 'About', href: '#about' },
  { label: 'Audience', href: '#audience' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

/**
 * Hero stat strip.
 *
 * Deliberately mixed-label (approved rewrite A6): three of these describe the
 * V1 DESIGN SCOPE rather than shipped integrations, so each label says which it
 * is and the hero prints a footnote. No invented adoption numbers (AGENTS.md
 * §14).
 */
export const HERO_STATS = [
  { value: '4', label: 'Organization roles (live today)' },
  { value: '1', label: 'Story, everywhere it fits' },
] as const;

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: 'What exactly is SocialOps?',
    a: 'SocialOps is an AI-assisted social media operations system. It carries every client engagement through one workflow — Client → Commitment → Task → Assignment → Content → Check → Approval → Publish → Distribute → Analytics → Report — while AI assists and humans stay in control.',
  },
  {
    q: 'Which platforms are supported in V1?',
    a: 'Instagram, Facebook and YouTube. X (Twitter) and WhatsApp Channels are explicitly out of V1 scope, so you will not see them promised anywhere on this page.',
  },
  {
    q: 'Does SocialOps auto-publish without approval?',
    a: 'No. Approval is a mandatory, recorded gate: only the client owner can grant final confirmation, and an item cannot be treated as approved without it. Publishing itself is not part of the current phase — when it ships, an approved item carrying a verifiable confirmation is its only valid input.',
  },
  {
    q: 'How do teams and permissions work?',
    a: 'Your organization is the tenant boundary. Each client is a first-class Client that you onboard, invite and link to your agency through an active relationship. People join via organization memberships with one of four roles — Owner, Admin, Member or Viewer — and access is checked on every request. Workspaces, task assignment and reporting are future phases.',
  },
  {
    q: 'How do I get started?',
    a: 'Choose Register and pick how you plan to use SocialOps — Service Provider (you handle accounts for others) or Individual / Business (you manage your own). Verify your email, sign in, and you land on your dashboard.',
  },
  {
    q: 'What happens when I send the contact form below?',
    a: 'Right now the form validates your message in the browser and shows a confirmation, but there is no backend inbox endpoint yet — that arrives in a later approved phase. For urgent matters, use the email address listed beside the form.',
  },
];
