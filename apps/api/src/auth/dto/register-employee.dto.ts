import { z } from 'zod';

/**
 * Zod schema for EMPLOYEE registration (Employee Module V1, Phase 2).
 *
 * Mirrors `registerSchema` (register.dto.ts) minus `accountType`:
 * employees are discriminated by the 1:1 EmployeeProfile row created in
 * the same transaction, NOT by AccountType — the AccountType enum remains
 * exactly SERVICE_PROVIDER | INDIVIDUAL_BUSINESS (AGENTS.md §17.1).
 *
 * Field contract (mirrors register.dto.ts):
 *   - fullName     required; min 1, max 200 characters
 *   - email        required; valid email format
 *   - phone        optional; max 50 characters (no SMS/OTP at this phase)
 *   - password     required; minimum 8 characters
 *
 * What is NOT accepted (same as standard registration):
 *   - confirmPassword (UI-only), displayName (populated server-side),
 *     isActive, emailVerifiedAt, role, organizationId, or any other
 *     backend-controlled field.
 */
export const registerEmployeeSchema = z.object({
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

export type RegisterEmployeeDto = z.infer<typeof registerEmployeeSchema>;
