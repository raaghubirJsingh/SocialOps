import { ClientField } from '@prisma/client';
import { z } from 'zod';

/**
 * Single-field profile change through the approved cooldown/verification
 * pipeline. `currentPassword` is the re-authentication (security check)
 * required for the locked security-controlled fields
 * (NAME / DIRECT_EMAIL / DIRECT_MOBILE).
 */
export const updateClientFieldSchema = z.object({
  field: z.nativeEnum(ClientField),
  value: z.string().max(4000).nullable(),
  currentPassword: z.string().min(1).max(200).optional(),
});

export type UpdateClientFieldDto = z.infer<typeof updateClientFieldSchema>;