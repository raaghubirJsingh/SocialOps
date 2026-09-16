import { z } from 'zod';

/**
 * Zod schema for creating a change request.
 * The contentId comes from the URL param; the body carries only the details.
 */
export const createChangeRequestSchema = z
  .object({
    requestDetails: z
      .string()
      .min(1, 'requestDetails must not be empty')
      .max(5000, 'requestDetails must be at most 5000 characters'),
  })
  .strict();

export type CreateChangeRequestDto = z.infer<
  typeof createChangeRequestSchema
>;