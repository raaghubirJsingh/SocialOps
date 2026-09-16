import type {
  ContentActor,
  ContentStatus,
  ContentTransitionTarget,
} from '@/types/content';
import { CONTENT_STATUS_LABELS } from '@/types/content';

/**
 * FROZEN MIRROR of the approved Content status machine (Decision 009).
 *
 * Source of truth: apps/api/src/content/constants/content-transitions.ts.
 * The server enforces all of this on every request; this mirror exists ONLY so
 * the UI can avoid offering actions that would certainly fail. It is NEVER a
 * security boundary (AGENTS.md section 7): the UI must still handle a 403/409
 * from the transition endpoint gracefully, because the client-side mirror can
 * (and eventually will) drift from the server.
 *
 * If the backend table changes, this file MUST be updated in the same change.
 */
export const CONTENT_STATUS_TRANSITIONS: Readonly<
  Record<ContentStatus, readonly ContentStatus[]>
> = Object.freeze({
  DRAFT: Object.freeze(['IN_REVIEW', 'ARCHIVED'] as const),
  IN_REVIEW: Object.freeze(['CHANGES_REQUESTED'] as const),
  CHANGES_REQUESTED: Object.freeze(['IN_REVIEW', 'ARCHIVED'] as const),
  APPROVED: Object.freeze(['ARCHIVED'] as const),
  ARCHIVED: Object.freeze([] as const),
});

/**
 * Who may perform each transition (Decision 009 / D1 + D1a). `*->APPROVED` is
 * intentionally absent: Final Confirmation is the only door to APPROVED and is
 * CLIENT OWNER only, exposed through the dedicated client endpoint.
 */
const CONTENT_TRANSITION_AUTHORITY: Readonly<
  Record<string, readonly ContentActor[]>
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

/** Human copy for each allowed transition, keyed the same way. */
const TRANSITION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'DRAFT->IN_REVIEW': 'Submit for review',
  'IN_REVIEW->CHANGES_REQUESTED': 'Request changes',
  'CHANGES_REQUESTED->IN_REVIEW': 'Resubmit for review',
  'DRAFT->ARCHIVED': 'Archive',
  'CHANGES_REQUESTED->ARCHIVED': 'Archive',
  'APPROVED->ARCHIVED': 'Archive',
});

export interface ContentTransitionOption {
  to: ContentTransitionTarget;
  label: string;
}

export function allowedTransitionsFor(
  status: ContentStatus,
): readonly ContentStatus[] {
  return CONTENT_STATUS_TRANSITIONS[status];
}

export function mayActorPerform(
  actor: ContentActor,
  from: ContentStatus,
  to: ContentStatus,
): boolean {
  const allowed = CONTENT_TRANSITION_AUTHORITY[`${from}->${to}`];
  return allowed !== undefined && allowed.includes(actor);
}

/**
 * The transitions the UI may offer for one item to one actor. ARCHIVED is
 * excluded because it lives in its own confirmation-gated control.
 */
export function availableTransitionsFor(
  actor: ContentActor,
  status: ContentStatus,
): readonly ContentTransitionOption[] {
  return allowedTransitionsFor(status)
    .filter((to) => to !== 'ARCHIVED' && mayActorPerform(actor, status, to))
    .map((to) => ({
      to: to as ContentTransitionTarget,
      label: TRANSITION_LABELS[`${status}->${to}`] ?? `Move to ${CONTENT_STATUS_LABELS[to]}`,
    }));
}

/** Archiving is offered separately from the review transitions. */
export function canArchive(
  actor: ContentActor,
  status: ContentStatus,
): boolean {
  return mayActorPerform(actor, status, 'ARCHIVED');
}

/**
 * Editing rules (approved D4/D7): text may change only in DRAFT or
 * CHANGES_REQUESTED. Editing an APPROVED item is allowed by the server but
 * reverts it to DRAFT and clears the confirmation, so the UI warns first.
 */
export function isEditable(status: ContentStatus): boolean {
  return status === 'DRAFT' || status === 'CHANGES_REQUESTED';
}

/** Editing an approved item silently invalidates an approval - warn loudly. */
export function editClearsConfirmation(status: ContentStatus): boolean {
  return status === 'APPROVED';
}

/** Final Confirmation is available to the CLIENT OWNER and only in review. */
export function canFinalConfirm(status: ContentStatus): boolean {
  return status === 'IN_REVIEW';
}

/** Progress position for the timeline (0..3); CHANGES_REQUESTED loops back. */
export function timelineStepFor(status: ContentStatus): number {
  switch (status) {
    case 'DRAFT':
      return 0;
    case 'IN_REVIEW':
    case 'CHANGES_REQUESTED':
      return 1;
    case 'APPROVED':
      return 2;
    case 'ARCHIVED':
      return 3;
  }
}