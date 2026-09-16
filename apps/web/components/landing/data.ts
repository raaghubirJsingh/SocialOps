/**
 * Static content for the public landing page (`/`).
 *
 * All content is presentational and honest about the foundation stage:
 *  - No fake user counts, no fake metrics.
 *  - Platform scope matches AGENTS.md §2 (Instagram / Facebook / YouTube
 *    in V1; X / WhatsApp explicitly out of scope).
 *  - Reviews are explicitly labelled illustrative samples (AGENTS.md §14
 *    forbids inventing business data — real testimonials arrive later).
 */

export interface NavTab {
  label: string;
  href: string;
}

export const NAV_TABS: NavTab[] = [
  { label: 'Features', href: '#features' },
  { label: 'About', href: '#about' },
  { label: 'Platforms', href: '#platforms' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Standards', href: '#standards' },
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
  { value: '3', label: 'V1 social platforms (scope lock)' },
  { value: '11', label: 'Workflow stages (product scope)' },
  { value: '4', label: 'Organization roles (live today)' },
  { value: '1', label: 'Story, everywhere it fits' },
] as const;

export const WORKFLOW_STEPS = [
  { name: 'Client', detail: 'Who the work is for' },
  { name: 'Commitment', detail: 'What was promised' },
  { name: 'Task', detail: 'Work broken down' },
  { name: 'Assignment', detail: 'Owned by someone' },
  { name: 'Content', detail: 'Drafts & formats' },
  { name: 'Check', detail: 'Quality review' },
  { name: 'Approval', detail: 'Human signs off' },
  { name: 'Publish', detail: 'Goes live' },
  { name: 'Distribute', detail: 'Across platforms' },
  { name: 'Analytics', detail: 'What happened' },
  { name: 'Report', detail: 'Client sees proof' },
] as const;

export interface Review {
  quote: string;
  name: string;
  role: string;
  initials: string;
  stars: number;
}

/**
 * Capability cards (replaces the earlier illustrative testimonials).
 *
 * Approved replacement (decision F2): presenting named people with star ratings
 * implied real social proof that does not exist yet, so the section now states
 * what the product ENFORCES. Every claim below is verifiable in this
 * repository - see docs/APPROVED_DECISIONS.md (Decisions 006, 008, 009) and the
 * integration specs under apps/api/test.
 */
export interface Capability {
  title: string;
  body: string;
}

export const CAPABILITIES: Capability[] = [
  {
    title: 'Approvals you can prove',
    body: 'Every final confirmation pins an immutable revision snapshot and its SHA-256 digest, written in the same transaction as the approval. A database constraint rejects an approved record that is missing any part of that.',
  },
  {
    title: 'Isolation by construction',
    body: 'Your organization is the tenant boundary. Every client-owned row carries a non-nullable client id, and an agency must hold an ACTIVE relationship to see a client at all. Out-of-scope reads answer one uniform 404 — no existence leaks.',
  },
  {
    title: 'Nothing secret is stored',
    body: 'No social media password, no access token, no refresh token. This phase records platform metadata only, and connecting accounts is deferred to a separately approved phase — so there is nothing here to leak.',
  },
  {
    title: 'Insert-only history',
    body: 'Content revisions and status transitions are append-only. Editing an approved item returns it to Draft and clears the confirmation, and the trail records exactly that — an approval can never be silently reused.',
  },
  {
    title: 'Least privilege, server-enforced',
    body: 'Four roles per organization membership — Owner, Admin, Member, Viewer. Every protected request re-verifies membership and tenant scope on the server; the interface hiding a button is never the control.',
  },
  {
    title: 'Honest by default',
    body: 'If a capability is not built, this page says so. No invented metrics, no fabricated customer counts, and no testimonials until real ones exist.',
  },
];

/**
 * The live-vs-next strip printed under the Features section.
 *
 * This exists so the page cannot imply that deferred modules (platform
 * connections, publishing, analytics) are already working.
 */
export const LIVE_TODAY: string[] = [
  'Accounts, sign-in and email verification',
  'Organization roles: Owner, Admin, Member, Viewer',
  'Client onboarding, invitations and agency linking',
  'Content drafting, review, and client-owner final approval',
  'Immutable revisions and append-only status history',
  'Raw intake records (text and metadata)',
];

export const NEXT_PHASES: string[] = [
  'Social platform connections (OAuth)',
  'Publishing and scheduling',
  'Distribution across formats',
  'Analytics and client reporting',
];

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
    a: 'No. Approval is a mandatory, recorded gate: only the client owner can grant final confirmation, and a database constraint refuses an approved record that is missing it. Publishing itself is not part of the current phase — when it ships, an approved item carrying a verifiable confirmation is its only valid input.',
  },
  {
    q: 'How do teams and permissions work?',
    a: 'Your organization is the tenant boundary. Each client is a first-class Client that you onboard, invite and link to your agency through an ACTIVE relationship. People join via organization memberships with one of four roles — Owner, Admin, Member or Viewer — and every protected request is authorized server-side. Workspaces, task assignment and reporting are future phases.',
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
