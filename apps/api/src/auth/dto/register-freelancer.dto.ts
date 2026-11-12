import { z } from 'zod';

import { userPhoneSchema } from '../../registration/dto/user-phone.dto.js';

/**
 * Zod schema for FREELANCER registration (dedicated endpoint).
 *
 * Freelancer registration uses a dedicated endpoint and creates the
 * FREELANCER AccountType and 1:1 FreelancerProfile in one transaction.
 */
export const registerFreelancerSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z.string().email('Invalid email format'),
  phone: userPhoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterFreelancerDto = z.infer<typeof registerFreelancerSchema>;