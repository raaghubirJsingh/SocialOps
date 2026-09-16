import { z } from 'zod';

/**
 * Generic status-transition payload (Client Operations V1).
 *
 * The accepted targets are deliberately limited:
 *   - `APPROVED` is EXCLUDED - the only door to it is the dedicated
 *     final-confirmation route (and its atomic triple write);
 *   - `DRAFT` is EXCLUDED - it is reachable only through the edit-after-
 *     approval revert (approved rule D7).
 *
 * The whitelist in `constants/content-transitions.ts` is checked again in the
 * service layer, together with the actor authority matrix, so this schema is
 * the outer bound and never the only guard.
 */
export const TRANSITION_TARGETS = ['IN_REVIEW', 'CHANGES_REQUESTED', 'ARCHIVED'] as const;

export const transitionContentSchema = z
  .object({
    to: z.enum(TRANSITION_TARGETS),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type TransitionContentDto = z.infer<typeof transitionContentSchema>;