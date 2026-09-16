import { z } from 'zod';

/**
 * The approved 3-scenario content pipeline (Phase 2).
 *
 *   - SCENARIO_1: AI-drafted content with a hard maximum of 2 change requests.
 *   - SCENARIO_2 / SCENARIO_3: the remaining approved pipelines (the change
 *     request limit applies to SCENARIO_1 only).
 */
export const SCENARIO_TYPES = [
  'SCENARIO_1',
  'SCENARIO_2',
  'SCENARIO_3',
] as const;

/**
 * Content creation payload (Client Operations V1 + Phase 2 scenario tagging).
 *
 * `status` is deliberately NOT accepted: every item is born DRAFT, and only
 * the status machine (ContentStatusService) may move it. `.strict()` rejects
 * any unexpected key, so a payload cannot smuggle a status, a confirmation
 * field, or an id.
 *
 * `scenarioType` is OPTIONAL: content created before the 3-scenario pipeline -
 * or content the Agency has not classified - stays NULL and is treated as
 * unclassified by the change-request limit rule. `agencyId` is NEVER accepted
 * from the payload: the managing Agency is resolved server-side from the
 * verified organization context (AGENTS.md sections 6-7).
 */
export const createContentSchema = z
  .object({
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(50_000),
    scenarioType: z.enum(SCENARIO_TYPES).optional(),
  })
  .strict();

export type CreateContentDto = z.infer<typeof createContentSchema>;