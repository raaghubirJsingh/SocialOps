import { z } from 'zod';

/** ClientStatus — EXACTLY ACTIVE | INACTIVE | SUSPENDED (locked). */
export const clientStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().max(500).optional(),
});

export type ClientStatusDto = z.infer<typeof clientStatusSchema>;