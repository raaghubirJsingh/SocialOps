import { z } from 'zod';

import { SOCIAL_PLATFORMS } from '../constants/social-platforms.js';

/**
 * SocialAccount creation payload (Client Operations V1).
 *
 * METADATA ONLY (AGENTS.md section 8; docs/APPROVED_DECISIONS.md Decision
 * 008): this contract accepts NO access token, refresh token, password, OAuth
 * code/state, scope, or any other credential, and this module never calls a
 * platform API. OAuth/token storage is deferred to a dedicated, separately
 * approved phase.
 *
 * Any token-shaped key must therefore be REJECTED rather than silently
 * ignored, which is what `.strict()` does: an unexpected key becomes a
 * 400 ValidationError instead of being stripped.
 *
 * `platformAccountId` is optional by design: without OAuth/API access the
 * platform-side identifier is often unknown, and requiring it would force
 * invented data. Nothing here is platform-verified.
 */
export const createSocialAccountSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    platformAccountId: z.string().min(1).max(200).nullish(),
    handle: z.string().min(1).max(200).nullish(),
    displayName: z.string().min(1).max(200).nullish(),
    profileUrl: z.string().min(1).max(500).nullish(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateSocialAccountDto = z.infer<typeof createSocialAccountSchema>;