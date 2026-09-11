import { z } from 'zod';

/** Agency-side invitation of a Client User by email. */
export const inviteClientSchema = z.object({
  email: z.string().email().max(200),
});

export type InviteClientDto = z.infer<typeof inviteClientSchema>;

/** Client-side request to connect a discoverable Agency. */
export const agencyRequestSchema = z.object({
  organizationId: z.string().uuid(),
});

export type AgencyRequestDto = z.infer<typeof agencyRequestSchema>;

/** Verification-token submission (email change / mobile verification). */
export const verifyTokenSchema = z.object({
  token: z.string().min(16).max(256),
});

export type VerifyTokenDto = z.infer<typeof verifyTokenSchema>;