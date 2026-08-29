import { z } from 'zod';

/**
 * Zod schema for token refresh payload.
 *
 * - refreshToken: required string (the refresh token value)
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
