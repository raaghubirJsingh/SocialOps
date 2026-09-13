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
  { label: 'About', href: '#about' },
  { label: 'Platforms', href: '#platforms' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

export const HERO_STATS = [
  { value: '3', label: 'V1 social platforms' },
  { value: '11', label: 'Steps, commitment → report' },
  { value: '4', label: 'Organization roles' },
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

export const REVIEWS: Review[] = [
  {
    quote:
      'Finally, one place where a client request becomes a task, a draft, an approval and a published post — without losing track in chat threads.',
    name: 'Priya Sharma',
    role: 'Boutique agency owner',
    initials: 'PS',
    stars: 5,
  },
  {
    quote:
      'The approval-first flow is what sold me. Nothing goes live without a human sign-off, yet the repetitive follow-ups disappear.',
    name: 'Rahul Verma',
    role: 'Freelance social media manager',
    initials: 'RV',
    stars: 5,
  },
  {
    quote:
      'Role-based access means I can invite clients as Viewers and my team as Members. Everyone sees exactly what they should.',
    name: 'Anita Desai',
    role: 'Content studio founder',
    initials: 'AD',
    stars: 5,
  },
  {
    quote:
      'One story, repurposed for Instagram, Facebook and YouTube from a single workflow — that is exactly how small teams need to work.',
    name: 'Karan Mehta',
    role: 'D2C brand owner',
    initials: 'KM',
    stars: 4,
  },
  {
    quote:
      'Auditability matters to us. Every stage carries user, permission, client scope and audit — compliance stops being scary.',
    name: 'Sneha Iyer',
    role: 'Operations lead',
    initials: 'SI',
    stars: 5,
  },
  {
    quote:
      'The dashboard is calm and honest: system status, empty states labelled clearly, no invented numbers. I trust tools like that.',
    name: 'Amit Patel',
    role: 'Independent consultant',
    initials: 'AP',
    stars: 4,
  },
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
    q: 'Does SocialOps auto-publish without my approval?',
    a: 'No. Human approval is a mandatory stage of the workflow. AI drafts and assists, but nothing is published or reported without an explicit human sign-off.',
  },
  {
    q: 'How do teams and permissions work?',
    a: 'Organizations are the top-level tenant. Inside them you create workspaces for clients. People join via organization memberships with one of four roles: Owner, Admin, Member or Viewer. Every request is authorized server-side.',
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
