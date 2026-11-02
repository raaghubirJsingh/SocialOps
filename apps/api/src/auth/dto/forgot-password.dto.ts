import { z } from 'zod';

/**
 * Request body for POST /api/auth/forgot-password.
 *
 * Returns a generic response regardless of whether the email exists,
 * to prevent email enumeration (AGENTS.md §8 security rules).
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

/**
 * Response from POST /api/auth/forgot-password.
 *
 * Always returns {"status": "queued"} regardless of whether the email
 * exists in the system, to prevent email enumeration.
 */
export interface ForgotPasswordResponse {
  status: 'queued';
}