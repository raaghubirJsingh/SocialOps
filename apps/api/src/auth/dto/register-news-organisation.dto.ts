import { z } from 'zod';

import { phoneInputSchema } from './phone-input.dto.js';

/**
 * Request body for POST /api/auth/register-news-organisation.
 *
 * News Organisation registration creates a User (SERVICE_PROVIDER accountType)
 * and an Organization (kind: NEWS_ORGANIZATION) in one transaction.
 *
 * The registrant is NOT automatically granted OWNER membership — the
 * organization is created with verificationStatus: PENDING, and the
 * first membership must be granted through a separate authorized process
 * (REG-01, REG-05).
 */
export const registerNewsOrganisationSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: phoneInputSchema,
  organisationName: z
    .string()
    .min(1, 'Organisation name is required')
    .max(200, 'Organisation name must be 200 characters or fewer'),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  organisationDescription: z
    .string()
    .max(1000, 'Description must be 1000 characters or fewer')
    .optional(),
  designation: z
    .string()
    .max(200, 'Designation must be 200 characters or fewer')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterNewsOrganisationDto = z.infer<
  typeof registerNewsOrganisationSchema
>;