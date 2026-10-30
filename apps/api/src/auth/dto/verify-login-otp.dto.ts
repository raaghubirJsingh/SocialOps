import { z } from 'zod';

/**
 * Zod schema for login OTP verification payload.
 *
 * - email: valid email format, required
 * - otp: 6-digit numeric code (string), required
 *
 * The email is required to identify the user without relying on a JWT;
 * the OTP verifies the user has access to the email.
 */
export const verifyLoginOtpSchema = z.object({
  email: z.string().email('Invalid email format'),
  otp: z
    .string()
    .regex(/^\d{6}$|^\d{8}$/, 'OTP must be 6 or 8 digits')
    .min(1, 'OTP is required'),
});

export type VerifyLoginOtpDto = z.infer<typeof verifyLoginOtpSchema>;
