import { z } from 'zod';

import { userPhoneSchema } from '../../registration/dto/user-phone.dto.js';

/**
 * Zod schema for explicit CLIENT registration (simple form).
 *
 * This DTO is the API boundary for the conventional Client registration
 * experience. It carries NO conversational discovery snapshot: the account
 * type is explicit and server-validated, never inferred from discovery
 * answers.
 *
 * Field contract:
 *   - fullName     required; min 1, max 200 characters
 *   - email        required; valid email format
 *   - phone        required; country-selected, strictly mobile, normalized to E.164
 *   - clientType   optional ClientType (INDIVIDUAL | BUSINESS). Not inferred;
 *                  a NULL value keeps the legacy activation path.
 *   - password     required; minimum 8 characters
 *
 * What is NOT accepted:
 *   - confirmPassword (UI-only), accountType (server-side), discoveryAnswers,
 *     isActive, emailVerifiedAt, role, organizationId, or any other
 *     backend-controlled field.
 */
export const registerClientSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().email('Invalid email format'),
  phone: userPhoneSchema,
  clientType: z.enum(['INDIVIDUAL', 'BUSINESS']).nullable().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterClientDto = z.infer<typeof registerClientSchema>;