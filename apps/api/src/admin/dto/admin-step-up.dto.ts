import { z } from 'zod';
import type { AdminStepUpChannel } from '@prisma/client';

/** Issue step-up OTP challenge */
export const adminStepUpChallengeSchema = z.object({
  /** Verification channel (V1 EMAIL only) */
  channel: z.enum(['EMAIL']),
});

export type AdminStepUpChallengeDto = z.infer<typeof adminStepUpChallengeSchema>;

/** Verify step-up OTP */
export const adminStepUpVerifySchema = z.object({
  /** Verification channel (V1 EMAIL only) */
  channel: z.enum(['EMAIL']),
  /** 6-digit OTP code */
  otp: z.string().regex(/^\d{6}$/, 'Invalid OTP format'),
});

export type AdminStepUpVerifyDto = z.infer<typeof adminStepUpVerifySchema>;

/** Resend step-up OTP */
export const adminStepUpResendSchema = z.object({
  /** Verification channel (V1 EMAIL only) */
  channel: z.enum(['EMAIL']),
});

export type AdminStepUpResendDto = z.infer<typeof adminStepUpResendSchema>;