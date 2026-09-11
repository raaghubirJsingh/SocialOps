import { z } from 'zod';

/**
 * Public registration account-type enum (AGENTS.md §17.1).
 *
 * The public `/register` page offers exactly these two values and no
 * other. Employee is intentionally NOT here: Employee registration is
 * a separate future flow.
 */
export const accountTypeSchema = z.enum(['SERVICE_PROVIDER', 'INDIVIDUAL_BUSINESS']);
export type AccountType = z.infer<typeof accountTypeSchema>;
