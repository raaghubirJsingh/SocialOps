import { z } from 'zod';

/**
 * Request body for POST /api/auth/reset-password.
 *
 * Consumes a password reset token and sets a new password.
 * Token lookup includes the email; no email in the body needed.
 * Only valid tokens (within 24 hours, not used, matching the user) are accepted.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // Email is optional in the body - if not provided, it will be looked up via token
  // This allows flexibility for different frontend implementations
  email: z.string().email('Invalid email format').optional(),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

/**
 * Response from POST /api/auth/reset-password.
 *
 * On success, returns a token pair for immediate login access.
 */
export interface ResetPasswordSuccessResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    accountType: string | null;
  };
}