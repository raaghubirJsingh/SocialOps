import { z } from 'zod';

import { normalizeUserPhone } from '../lib/user-phone.js';

/**
 * Country-selected local phone input, transformed to canonical E.164.
 * User.phone policy only; Client contact fields keep their own contracts.
 */
export const userPhoneSchema = z
  .object({
    country: z.string().min(2).max(2),
    number: z.string().trim().min(1).max(50),
  })
  .superRefine(({ country, number }, ctx) => {
    if (!normalizeUserPhone(country, number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message: 'Enter a valid mobile number for the selected country',
      });
    }
  })
  .transform(({ country, number }) => normalizeUserPhone(country, number)!);
