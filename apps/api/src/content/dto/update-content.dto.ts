import { z } from 'zod';

import { createContentSchema } from './create-content.dto.js';

/**
 * Content edit payload (Client Operations V1).
 *
 * Still `.strict()`, and `status` / confirmation fields are NOT accepted: the
 * edit path owns the approved rule D7 (editing an APPROVED item appends a new
 * immutable revision, returns the item to DRAFT, and CLEARS the confirmation
 * triple). `expectedRevision` implements the approved optimistic-concurrency
 * default (D5): when supplied it must equal the latest stored revision, so a
 * stale editor cannot silently overwrite newer text.
 */
export const updateContentSchema = createContentSchema
  .partial()
  .extend({
    expectedRevision: z.number().int().positive().optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: 'At least one of title or body must be provided',
  });

export type UpdateContentDto = z.infer<typeof updateContentSchema>;