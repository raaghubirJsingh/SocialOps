import { z } from 'zod';

import { industrySchema } from '../constants/industries.js';

/**
 * Agency-side Client creation (approved scope): the creating Agency MAY
 * create an unbound Client — ownerUserId stays NULL, onboardingStatus
 * starts PENDING, and the Agency creator NEVER becomes the Client owner.
 * directEmail/directPhone are REQUIRED; industry is restricted to the
 * approved D4 values.
 */
export const createClientSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'BUSINESS']),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  logoUrl: z.string().max(500).nullish(),
  directEmail: z.string().email().max(200),
  directPhone: z.string().min(5).max(50),
  primaryContactName: z.string().max(200).nullish(),
  primaryContactPhone: z.string().min(5).max(50).nullish(),
  website: z.string().max(300).nullish(),
  addressLine1: z.string().max(200).nullish(),
  addressLine2: z.string().max(200).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  country: z.string().max(100).nullish(),
  postalCode: z.string().max(20).nullish(),
  industry: industrySchema.nullish(),
  notes: z.string().max(5000).nullish(),
});

export type CreateClientDto = z.infer<typeof createClientSchema>;

/**
 * Self-registration Client onboarding (no Agency invitation; the
 * registering Individual/Business User becomes the Client owner through
 * the controlled activation flow). Internal Notes are not part of this
 * intake contract.
 */
export const startOnboardingSchema = createClientSchema.omit({ notes: true });

export type StartOnboardingDto = z.infer<typeof startOnboardingSchema>;