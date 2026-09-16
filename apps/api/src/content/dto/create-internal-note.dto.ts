import { z } from 'zod';

/**
 * Zod schema for creating an internal note (agency-only).
 * The contentId comes from the URL param; the body carries the note text.
 */
export const createInternalNoteSchema = z
  .object({
    body: z
      .string()
      .min(1, 'body must not be empty')
      .max(10000, 'body must be at most 10000 characters'),
  })
  .strict();

export type CreateInternalNoteDto = z.infer<typeof createInternalNoteSchema>;