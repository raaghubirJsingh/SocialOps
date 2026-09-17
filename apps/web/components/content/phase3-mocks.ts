/**
 * Phase 3 (UI-first) mock data for the Content Module preview.
 *
 * Everything here is static fixture data for visual review ONLY. Nothing is
 * fetched from or written to the backend. The real wiring (React Query hooks
 * against the Phase 2 NestJS APIs) comes in a later phase.
 *
 * Boundary note: MOCK_INTERNAL_NOTES must only ever be imported by the Agency
 * workspace component. The Client review portal component deliberately has no
 * import of them, mirroring the server-side rule that Clients never receive
 * internal notes.
 */

export interface MockAssignee {
  id: string;
  name: string;
  /** Human-readable role or skill label shown in the dropdown. */
  skill: string;
  /** `true` for AI employees (User.isBot), `false` for humans. */
  isBot: boolean;
}

export const MOCK_ASSIGNEES: readonly MockAssignee[] = Object.freeze([
  { id: 'human-1', name: 'Priya Sharma', skill: 'Content Manager', isBot: false },
  { id: 'human-2', name: 'Daniel Osei', skill: 'Copywriter', isBot: false },
  { id: 'ai-1', name: 'Nova', skill: 'AI Copywriter', isBot: true },
  { id: 'ai-2', name: 'Rankly', skill: 'AI SEO Expert', isBot: true },
]);

export interface MockInternalNote {
  id: string;
  author: string;
  createdAt: string;
  body: string;
}

export const MOCK_INTERNAL_NOTES: readonly MockInternalNote[] = Object.freeze([
  {
    id: 'note-1',
    author: 'Priya Sharma (Manager)',
    createdAt: '2026-09-10 14:32',
    body: 'Nova draft is solid on structure but the hook needs tightening before this goes anywhere near the client.',
  },
  {
    id: 'note-2',
    author: 'Nova (AI Copywriter)',
    createdAt: '2026-09-10 15:05',
    body: 'Revised hook drafted as revision 3. Flagging: the client brief contradicts itself on tone (playful vs formal) — needs a manager call.',
  },
]);

export const MOCK_DRAFT = Object.freeze({
  title: 'September Campaign — Launch Announcement',
  scenario: 'SCENARIO_1',
  status: 'AWAITING_MANAGER_APPROVAL',
  revision: 3,
  body: 'Big news: our new autumn collection drops next Monday. Early access for subscribers opens Friday at 9am — watch your inbox for the private link.\n\nP.S. Launch-day in-store event, 5–8pm. Bring a friend.',
});

export const MOCK_POLISHED_CONTENT = Object.freeze({
  title: 'September Campaign — Launch Announcement',
  scenario: 'SCENARIO_1',
  status: 'UNDER_CLIENT_REVIEW',
  body: 'Big news: our new autumn collection drops next Monday. Early access for subscribers opens Friday at 9am — watch your inbox for the private link.\n\nP.S. Launch-day in-store event, 5–8pm. Bring a friend.',
});

/** Scenario 1 allows a maximum of 2 change requests per content item. */
export const MOCK_CHANGE_REQUEST_LIMIT = 2;

export interface MockChangeRequest {
  id: string;
  createdAt: string;
  details: string;
}

export const MOCK_CHANGE_REQUESTS_USED: readonly MockChangeRequest[] =
  Object.freeze([
    {
      id: 'cr-1',
      createdAt: '2026-09-11 10:14',
      details:
        'Please change the event time from 5–8pm to 4–7pm to match the store hours.',
    },
  ]);
