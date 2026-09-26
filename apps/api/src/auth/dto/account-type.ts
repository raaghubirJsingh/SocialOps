import { z } from 'zod';

/**
 * Public registration account-type enum (AGENTS.md §17.1 as amended by
 * Registration Phase v1.0 / L12).
 *
 * Exactly two values: CLIENT and SERVICE_PROVIDER. Individual vs Business
 * is a ClientType, never an AccountType. Employee is intentionally NOT
 * here: employee registration is a separate flow and employees carry
 * `accountType = null` (AGENTS.md §17.1).
 */
export const accountTypeSchema = z.enum(['SERVICE_PROVIDER', 'CLIENT']);
export type AccountType = z.infer<typeof accountTypeSchema>;
