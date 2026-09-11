import { z } from 'zod';

/**
 * Zod schema for the email-verification payload.
 *
 * - token: the one-time verification token (base64url) taken from the
 *   verification URL. The raw token never hits the database; only the
 *   SHA-256 hash is persisted (AGENTS.md §8).
 */
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;