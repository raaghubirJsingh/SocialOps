import { z } from 'zod';

import { createSocialAccountSchema } from './create-social-account.dto.js';

/**
 * SocialAccount metadata update (Client Operations V1).
 *
 * `platform` is immutable after creation (approved decision D10): changing
 * platform means creating a new record, so an existing account can never be
 * silently re-pointed at another platform.
 *
 * Still METADATA ONLY and `.strict()` - a credential key must never reach this
 * endpoint, and `.refine()` rejects an empty payload so a no-op update cannot
 * silently do nothing.
 */
export const updateSocialAccountSchema = createSocialAccountSchema
  .omit({ platform: true })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one updatable field must be provided',
  });

export type UpdateSocialAccountDto = z.infer<typeof updateSocialAccountSchema>;