import { ContentStatus } from '@prisma/client';

/**
 * LOCKED Content status machine (Client Operations V1, Decision 009).
 *
 * AGENTS.md section 13 still defers the Publishing engine, so APPROVED is the
 * TERMINAL state: no PUBLISHED/SCHEDULED value exists here.
 *
 * Three rules make "publishing only after Final Confirmation" structural
 * rather than conventional:
 *   1. APPROVED is NOT a target in CONTENT_STATUS_TRANSITIONS - the ONLY door
 *      to it is ContentStatusService.confirmFinal(), which writes the
 *      confirmation triple atomically;
 *   2. the DB CHECK constraint
 *      `Content_approved_requires_final_confirmation` refuses an approved row
 *      missing any element of the triple, even if application code is bypassed;
 *   3. APPROVED -> DRAFT exists only as the edit-only revert edge below, so a
 *      confirmation can never be silently reused after the text changes.
 *
 * Do NOT invent additional transitions or add PUBLISHED without explicit human
 * approval; the colocated spec asserts this table stays complete and frozen.
 */
export const CONTENT_STATUS_TRANSITIONS: Readonly<
  Record<ContentStatus, readonly ContentStatus[]>
> = Object.freeze({
  [ContentStatus.DRAFT]: Object.freeze([
    ContentStatus.IN_REVIEW,
    ContentStatus.ARCHIVED,
  ]),
  [ContentStatus.IN_REVIEW]: Object.freeze([
    ContentStatus.CHANGES_REQUESTED,
  ]),
  [ContentStatus.CHANGES_REQUESTED]: Object.freeze([
    ContentStatus.IN_REVIEW,
    ContentStatus.ARCHIVED,
  ]),
  [ContentStatus.APPROVED]: Object.freeze([ContentStatus.ARCHIVED]),
  [ContentStatus.ARCHIVED]: Object.freeze([] as ContentStatus[]),
});

/**
 * Who may perform each non-review transition (Decision 009 / D1 + D1a).
 * Review decisions are CLIENT OWNER only; Final Confirmation is NOT listed
 * here because confirmFinal() is its sole door.
 */
export type ContentTransitionActor = 'CLIENT_OWNER' | 'AGENCY_ADMIN';

export const CONTENT_TRANSITION_AUTHORITY: Readonly<
  Record<string, readonly ContentTransitionActor[]>
> = Object.freeze({
  'DRAFT->IN_REVIEW': Object.freeze(['AGENCY_ADMIN', 'CLIENT_OWNER'] as const),
  'IN_REVIEW->CHANGES_REQUESTED': Object.freeze(['CLIENT_OWNER'] as const),
  'CHANGES_REQUESTED->IN_REVIEW': Object.freeze([
    'AGENCY_ADMIN',
    'CLIENT_OWNER',
  ] as const),
  'DRAFT->ARCHIVED': Object.freeze(['AGENCY_ADMIN', 'CLIENT_OWNER'] as const),
  'CHANGES_REQUESTED->ARCHIVED': Object.freeze([
    'AGENCY_ADMIN',
    'CLIENT_OWNER',
  ] as const),
  'APPROVED->ARCHIVED': Object.freeze([
    'AGENCY_ADMIN',
    'CLIENT_OWNER',
  ] as const),
});

/** The edit-after-approval revert (approved rule D7). */
export const EDIT_REVERT_FROM: ContentStatus = ContentStatus.APPROVED;
export const EDIT_REVERT_TO: ContentStatus = ContentStatus.DRAFT;

/** The approved V1 Content status values (spec-asserted against the Prisma enum). */
export const CONTENT_STATUSES = Object.freeze([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ARCHIVED',
] as const);

export function transitionKey(
  from: ContentStatus,
  to: ContentStatus,
): string {
  return `${from}->${to}`;
}

/** Whether the status machine permits this edge at all (actor aside). */
export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return CONTENT_STATUS_TRANSITIONS[from].includes(to);
}

export function allowedTransitionsFor(
  from: ContentStatus,
): readonly ContentStatus[] {
  return CONTENT_STATUS_TRANSITIONS[from];
}

/** The edit-only revert edge is never reachable through the generic route. */
export function isEditOnlyTransition(
  from: ContentStatus,
  to: ContentStatus,
): boolean {
  return from === EDIT_REVERT_FROM && to === EDIT_REVERT_TO;
}

/** Whether the given actor may perform the transition (review = client only). */
export function mayActorPerform(
  actor: ContentTransitionActor,
  from: ContentStatus,
  to: ContentStatus,
): boolean {
  const allowed = CONTENT_TRANSITION_AUTHORITY[transitionKey(from, to)];
  return allowed !== undefined && allowed.includes(actor);
}