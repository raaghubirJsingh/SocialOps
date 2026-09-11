import { z } from 'zod';

import { accountTypeSchema } from './account-type.js';
export { accountTypeSchema, type AccountType } from './account-type.js';

/**
 * Zod schema for user registration payload (AGENTS.md §17.2).
 *
 * Field contract:
 *   - accountType  required; exactly one of the two values
 *   - fullName     required; min 1, max 200 characters
 *   - email        required; valid email format
 *   - phone        optional; max 50 characters (no SMS/OTP at this phase)
 *   - password     required; minimum 8 characters
 *
 * What is NOT accepted on the registration endpoint:
 *   - confirmPassword (UI-only; never sent)
 *   - displayName    (populated server-side from fullName for back-compat)
 *   - isActive       (always set to false server-side)
 *   - emailVerifiedAt
 *   - role, organizationId, or any other backend-controlled field
 *
 * Frontend-controlled accountType is product metadata only.
 */
export const registerSchema = z.object({
  accountType: accountTypeSchema,
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().email('Invalid email format'),
  phone: z
    .string()
    .min(1, 'Phone is too short')
    .max(50, 'Phone is too long')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
