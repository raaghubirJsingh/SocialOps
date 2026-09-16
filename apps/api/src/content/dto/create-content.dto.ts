import { z } from 'zod';

/**
 * Content creation payload (Client Operations V1).
 *
 * `status` is deliberately NOT accepted: every item is born DRAFT, and only
 * the status machine (ContentStatusService) may move it. `.strict()` rejects
 * any unexpected key, so a payload cannot smuggle a status, a confirmation
 * field, or an id.
 */
export const createContentSchema = z
  .object({
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(50_000),
  })
  .strict();

export type CreateContentDto = z.infer<typeof createContentSchema>;