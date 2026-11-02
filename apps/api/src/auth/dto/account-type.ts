import { z } from 'zod';

/**
 * Public registration account-type enum (AGENTS.md §17.1 as amended by
 * Registration Phase v1.0 / L12).
 *
 * Staged registration accepts CLIENT and SERVICE_PROVIDER. FREELANCER
 * registration uses its dedicated endpoint; Employee accounts carry
 * `accountType = null` and are identified by EmployeeProfile.
 */
export const accountTypeSchema = z.enum(['SERVICE_PROVIDER', 'CLIENT']);
export type AccountType = z.infer<typeof accountTypeSchema>;
