import { z } from 'zod';

/**
 * Zod schema for user registration payload.
 *
 * - email: valid email format, required
 * - password: minimum 8 characters, required
 * - displayName: optional string
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
});

export type RegisterDto = z.infer<typeof registerSchema>;
