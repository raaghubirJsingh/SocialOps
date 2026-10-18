import { z } from 'zod';

/**
 * Request body for creating a Decision 009 change request.
 *
 * The clientId and contentId come from the URL params; the body carries
 * only the request details. The service derives organizationId and the
 * actor from the verified request context.
 */
export const createChangeRequestSchema = z
  .object({
    requestDetails: z
      .string()
      .min(1, 'requestDetails must not be empty')
      .max(5000, 'requestDetails must be at most 5000 characters'),
  })
  .strict();

export type Decision009CreateChangeRequestDto = z.infer<
  typeof createChangeRequestSchema
>;
