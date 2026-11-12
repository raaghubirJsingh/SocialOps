import { z } from 'zod';

/**
 * Shared phone input schema used across registration DTOs.
 *
 * The country is explicitly selected by the user — never inferred.
 * The number is validated as MOBILE only (fixed-line and ambiguous
 * FIXED_LINE_OR_MOBILE are rejected).
 *
 * Normalization to canonical E.164 happens in the service layer.
 */
export const phoneInputSchema = z.object({
  country: z.string().min(1, 'Country is required'),
  number: z.string().trim().min(1, 'Mobile number is required').max(50),
});

export type PhoneInputDto = z.infer<typeof phoneInputSchema>;