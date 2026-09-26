import { z } from 'zod';

/**
 * Zod schema for EMPLOYEE registration (Employee Module V1, Phase 2).
 *
 * Employee registration is intentionally separate from (and unaffected
 * by) the retired public register flow: employees are discriminated by
 * the 1:1 EmployeeProfile row created in the same transaction, NOT by
 * AccountType — the AccountType enum is SERVICE_PROVIDER | CLIENT
 * (Registration Phase v1.0, Decision 014; AGENTS.md §17.1) and has no
 * EMPLOYEE value.
 *
 * Field contract:
 *   - fullName     required; min 1, max 200 characters
 *   - email        required; valid email format
 *   - phone        optional; max 50 characters (no SMS/OTP at this phase)
 *   - password     required; minimum 8 characters
 *
 * What is NOT accepted:
 *   - confirmPassword (UI-only), displayName (populated server-side),
 *     accountType, isActive, emailVerifiedAt, role, organizationId,
 *     or any other backend-controlled field.
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
