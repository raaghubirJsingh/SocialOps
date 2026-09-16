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
 * Phase 2 (Unified Content & AI Foundation) adds workflow states for the
 * 3-scenario content pipeline:
 *   - AWAITING_MANAGER_APPROVAL: AI draft pending manager review
 *   - UNDER_CLIENT_REVIEW: Manager-approved draft sent to client
 *   - FINAL_CONFIRMED: Client has confirmed (terminal before publishing)
 *
 * Do NOT invent additional transitions or add PUBLISHED without explicit human
 * approval; the colocated spec asserts this table stays complete and frozen.
 */
export const CONTENT_STATUS_TRANSITIONS: Readonly<
  Record<ContentStatus, readonly ContentStatus[]>
> = Object.freeze({
  [ContentStatus.DRAFT]: Object.freeze([
    ContentStatus.IN_REVIEW,
    ContentStatus.AWAITING_MANAGER_APPROVAL,
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
  // Phase 2 workflow states
  [ContentStatus.AWAITING_MANAGER_APPROVAL]: Object.freeze([
    ContentStatus.UNDER_CLIENT_REVIEW,
    ContentStatus.DRAFT,
  ]),
  [ContentStatus.UNDER_CLIENT_REVIEW]: Object.freeze([
    ContentStatus.FINAL_CONFIRMED,
    ContentStatus.AWAITING_MANAGER_APPROVAL,
  ]),
  [ContentStatus.FINAL_CONFIRMED]: Object.freeze([ContentStatus.ARCHIVED]),
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
  // Phase 2 workflow transitions
  'DRAFT->AWAITING_MANAGER_APPROVAL': Object.freeze(['AGENCY_ADMIN'] as const),
  'AWAITING_MANAGER_APPROVAL->UNDER_CLIENT_REVIEW': Object.freeze([
    'AGENCY_ADMIN',
  ] as const),
  'AWAITING_MANAGER_APPROVAL->DRAFT': Object.freeze(['AGENCY_ADMIN'] as const),
  'UNDER_CLIENT_REVIEW->FINAL_CONFIRMED': Object.freeze([
    'CLIENT_OWNER',
  ] as const),
  'UNDER_CLIENT_REVIEW->AWAITING_MANAGER_APPROVAL': Object.freeze([
    'CLIENT_OWNER',
  ] as const),
  'FINAL_CONFIRMED->ARCHIVED': Object.freeze([
    'AGENCY_ADMIN',
    'CLIENT_OWNER',
  ] as const),
});

/** The edit-after-approval revert (approved rule D7). */
export const EDIT_REVERT_FROM: ContentStatus = ContentStatus.APPROVED;
export const EDIT_REVERT_TO: ContentStatus = ContentStatus.DRAFT;

/**
 * The approved Content status values (spec-asserted against the Prisma enum).
 * Phase 2 (Unified Content & AI Foundation) added the three workflow states
 * below; the set must stay equal to the Prisma `ContentStatus` enum.
 */
export const CONTENT_STATUSES = Object.freeze([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ARCHIVED',
  // Phase 2 workflow states
  'AWAITING_MANAGER_APPROVAL',
  'UNDER_CLIENT_REVIEW',
  'FINAL_CONFIRMED',
] as const);

export function transitionKey(
  from: ContentStatus,
  to: ContentStatus,
): string {
  return `${from}->${to}`;
}

/**
 * Statuses in which a Content item is STRICTLY IMMUTABLE (Phase 2 final
 * confirmation gate). In these states the item refuses new revisions, edits,
 * change requests, and AI tasks.
 *
 * APPROVED is deliberately NOT listed: the approved rule D7 lets an edit revert
 * an APPROVED item back to DRAFT with a fresh revision.
 */
export const IMMUTABLE_CONTENT_STATUSES = Object.freeze([
  ContentStatus.FINAL_CONFIRMED,
  ContentStatus.ARCHIVED,
] as const);

/** Whether the item is locked against every mutation but archiving. */
export function isContentImmutable(status: ContentStatus): boolean {
  return (IMMUTABLE_CONTENT_STATUSES as readonly ContentStatus[]).includes(
    status,
  );
}

/**
 * Statuses that refuse a NEW change request.
 *
 *   - APPROVED / FINAL_CONFIRMED: the Client already gave Final Confirmation and
 *     the machine allows only ARCHIVED from here, so a change request could
 *     never be acted upon - accepting one would be a silent dead end.
 *   - ARCHIVED: the item is retired.
 */
export const CHANGE_REQUEST_LOCKED_STATUSES = Object.freeze([
  ContentStatus.APPROVED,
  ContentStatus.FINAL_CONFIRMED,
  ContentStatus.ARCHIVED,
] as const);

/** Whether new change requests are refused in this status. */
export function isChangeRequestLocked(status: ContentStatus): boolean {
  return (CHANGE_REQUEST_LOCKED_STATUSES as readonly ContentStatus[]).includes(
    status,
  );
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