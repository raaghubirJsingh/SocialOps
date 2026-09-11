import { z } from 'zod';

/**
 * Zod schema for the resend-verification payload.
 *
 * - email: valid email format, required
 *
 * The response is intentionally generic (200 {"status":"queued"}) so the
 * endpoint cannot be used to enumerate registered emails (approved plan).
 */
export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;