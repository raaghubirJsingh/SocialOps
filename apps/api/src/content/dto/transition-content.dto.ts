import { z } from 'zod';

/**
 * Generic status-transition payload (Client Operations V1 + Phase 2 pipeline).
 *
 * The accepted targets are deliberately limited:
 *   - `APPROVED` is EXCLUDED - the only door to it is the dedicated
 *     final-confirmation route (and its atomic triple write);
 *   - `FINAL_CONFIRMED` is EXCLUDED - the only door to it is the dedicated
 *     final-confirmed-lock route (Phase 2);
 *   - `DRAFT` is EXCLUDED - it is reachable only through the edit-after-
 *     approval revert (approved rule D7).
 *
 * Phase 2 adds `AWAITING_MANAGER_APPROVAL` and `UNDER_CLIENT_REVIEW` so the
 * generic route can carry the approved pipeline edges (notably the manager
 * submit-for-review edge AWAITING_MANAGER_APPROVAL -> UNDER_CLIENT_REVIEW).
 * Every target is still re-checked against the whitelist in
 * `constants/content-transitions.ts` plus the actor authority matrix in the
 * service layer, so this schema is the outer bound and never the only guard.
 */
export const TRANSITION_TARGETS = [
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'ARCHIVED',
  // Phase 2 pipeline states (generic-route reachable; APPROVED /
  // FINAL_CONFIRMED / DRAFT remain excluded above).
  'AWAITING_MANAGER_APPROVAL',
  'UNDER_CLIENT_REVIEW',
] as const;

export const transitionContentSchema = z
  .object({
    to: z.enum(TRANSITION_TARGETS),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type TransitionContentDto = z.infer<typeof transitionContentSchema>;