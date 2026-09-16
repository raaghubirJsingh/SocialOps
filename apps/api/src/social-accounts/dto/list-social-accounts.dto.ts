import { z } from 'zod';

import { normaliseTake, takeQuerySchema } from '../../common/list-query.js';
import {
  SOCIAL_PLATFORMS,
  type SocialPlatformValue,
} from '../constants/social-platforms.js';

/**
 * List filters for social accounts.
 *
 * Shape only: the shared `ZodValidationPipe` requires a schema whose INPUT and
 * OUTPUT types are identical, so no `.default()`, `.transform()`, or
 * `z.coerce.*` may appear here. The raw string values are normalised below, and
 * the approved pagination bounds (decision D8) live in ONE place -
 * `common/list-query.ts`.
 *
 * NOTE: query schemas are intentionally NOT `.strict()` - query strings
 * routinely carry unrelated parameters (cache-busting, analytics), so unknown
 * keys are ignored rather than rejected. Body DTOs remain `.strict()`, which is
 * where metadata-only enforcement matters.
 */
export const listSocialAccountsQuerySchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  take: takeQuerySchema,
});

export type ListSocialAccountsQueryDto = z.infer<
  typeof listSocialAccountsQuerySchema
>;

/** Validated, normalised list filters used by the domain service. */
export interface ListSocialAccountsQuery {
  platform?: SocialPlatformValue;
  isActive?: boolean;
  take: number;
}

/**
 * Converts the validated raw query into typed filters. Server-side validation
 * remains authoritative: an out-of-range `take` is a 400, never a silent clamp.
 */
export function normaliseListSocialAccountsQuery(
  dto: ListSocialAccountsQueryDto,
): ListSocialAccountsQuery {
  return {
    platform: dto.platform,
    isActive: dto.isActive === undefined ? undefined : dto.isActive === 'true',
    take: normaliseTake(dto.take),
  };
}