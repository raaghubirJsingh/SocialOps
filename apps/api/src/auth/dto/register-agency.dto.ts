import { z } from 'zod';

import { userPhoneSchema } from '../../registration/dto/user-phone.dto.js';

/**
 * Zod schema for explicit SERVICE_PROVIDER / Agency registration (simple form).
 *
 * This DTO is the API boundary for the conventional Agency registration
 * experience. The Organization name is collected during registration using
 * the existing supported provisioning contract.
 *
 * Field contract:
 *   - fullName         required; min 1, max 200 characters
 *   - email            required; valid email format
 *   - phone            required; country-selected, strictly mobile, normalized to E.164
 *   - organizationName required; min 1, max 200 characters
 *   - password         required; minimum 8 characters
 *
 * What is NOT accepted:
 *   - confirmPassword (UI-only), accountType (server-side), discoveryAnswers,
 *     isActive, emailVerifiedAt, role, organizationId, or any other
 *     backend-controlled field.
 */
export const registerAgencySchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().email('Invalid email format'),
  phone: userPhoneSchema,
  organizationName: z
    .string()
    .min(1, 'Organization name is required')
    .max(200, 'Organization name must be 200 characters or fewer'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterAgencyDto = z.infer<typeof registerAgencySchema>;