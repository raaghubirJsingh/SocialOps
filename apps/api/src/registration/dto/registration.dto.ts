import { z } from 'zod';

import { accountTypeSchema } from '../../auth/dto/account-type.js';

import { normalizePhone } from '../lib/phone-normalization.js';

/**
 * Zod schemas for the Registration Phase v1.0 staged endpoints.
 *
 * Shared: the resumeToken is the ONLY registration-stage credential
 * (OPEN-1, D1-A): a raw random token issued once by /start (and rotated
 * in place at each reminder event), stored only as SHA-256. It is not a
 * JWT, not a login token, not a session.
 */

const resumeTokenSchema = z
  .string()
  .min(1, 'resumeToken is required')
  .max(512, 'resumeToken is too long');

/** POST /api/auth/registration/start */
export const registrationStartSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().email('Invalid email format'),
  phone: z
    .string()
    .min(1, 'Phone is too short')
    .max(50, 'Phone is too long')
    .refine((value) => normalizePhone(value) !== null, {
      message: 'Invalid phone format',
    })
    .transform((value) => normalizePhone(value)!),
  // Nullable: PendingRegistration.accountType MAY be null while discovery
  // is unresolved (L13). It MUST be non-null before User creation - the
  // password stage enforces that. Classification is never guessed.
  accountType: accountTypeSchema.nullable().optional(),
  // JSON snapshot of the accepted discovery conversation (L8). The server
  // stores it verbatim; it is never re-asked after this point.
  discoveryAnswers: z.record(z.unknown()).optional(),
  // Present only when RE-entering an existing active pending registration
  // (L6/OPEN-9): must be the CURRENT raw token. Omitted on first start.
  resumeToken: resumeTokenSchema.optional(),
});

export type RegistrationStartDto = z.infer<typeof registrationStartSchema>;

const otpChannelSchema = z.enum(['EMAIL', 'WHATSAPP']);

/** POST /api/auth/registration/otp/verify */
export const otpVerifySchema = z.object({
  resumeToken: resumeTokenSchema,
  channel: otpChannelSchema,
  // String (never number) so a leading zero is preserved exactly (L4).
  otp: z
    .string()
    .regex(/^\d{6}$/, 'OTP must be a 6-digit numeric code'),
});

export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

/** POST /api/auth/registration/otp/resend */
export const otpResendSchema = z.object({
  resumeToken: resumeTokenSchema,
  channel: otpChannelSchema,
});

export type OtpResendDto = z.infer<typeof otpResendSchema>;

/** POST /api/auth/registration/password */
export const registrationPasswordSchema = z.object({
  resumeToken: resumeTokenSchema,
  // Password is created ONLY after BOTH verifications succeed (enforced
  // server-side before this schema is even reached). Minimum 8 (L12).
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // Resume-path completion (L13): PendingRegistration.accountType may be
  // null when the user resumes a registration whose discovery was still
  // unresolved; the UI collects the EXPLICIT forced choice first and
  // sends it here so Account Creation can never guess. Optional because
  // the normal flow persists classification at /start.
  accountType: accountTypeSchema.nullable().optional(),
  // NOTE: confirmPassword is UI-only and is NEVER sent (same contract as
  // the legacy register endpoint).
});

export type RegistrationPasswordDto = z.infer<
  typeof registrationPasswordSchema
>;

/** POST /api/auth/registration/resume */
export const registrationResumeSchema = z.object({
  resumeToken: resumeTokenSchema,
});

export type RegistrationResumeDto = z.infer<typeof registrationResumeSchema>;