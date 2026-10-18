import { z } from 'zod';

/**
 * Request body for confirming a Decision 009 change request.
 *
 * The clientId and changeRequestId come from the URL params; the body
 * carries only an optional audit note.
 */
export const confirmChangeRequestSchema = z
  .object({
    note: z.string().max(2000).optional(),
  })
  .strict();

export type Decision009ConfirmChangeRequestDto = z.infer<
  typeof confirmChangeRequestSchema
>;
