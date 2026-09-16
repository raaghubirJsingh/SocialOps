import { z } from 'zod';

/**
 * Final Confirmation payload (Client Operations V1).
 *
 * This is the ONLY input to the only endpoint that can move Content to
 * APPROVED, and only the CLIENT OWNER may call it (approved decision D4). The
 * body carries no status, no revision id, and no confirmation fields - the
 * service derives all of them server-side and writes the triple atomically in
 * one transaction (approved default D9: an optional audit note only).
 */
export const confirmFinalContentSchema = z
  .object({
    note: z.string().max(2000).optional(),
  })
  .strict();

export type ConfirmFinalContentDto = z.infer<
  typeof confirmFinalContentSchema
>;