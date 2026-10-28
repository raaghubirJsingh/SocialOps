import { z } from 'zod';

/**
 * Agency-side invitation of a Client User.
 *
 * The recipient is the Client's saved `directEmail`, resolved server-side
 * from the tenant-scoped Client row. The request body carries NO recipient:
 * a caller-supplied email must never override it, so the schema is strict
 * and rejects any unexpected field.
 */
export const inviteClientSchema = z.object({}).strict();

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