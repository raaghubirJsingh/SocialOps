import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { SOCIAL_PLATFORMS, type SocialPlatformValue } from '../constants/social-platforms.js';

/**
 * List filters for social accounts.
 *
 * Shape only: the shared `ZodValidationPipe` requires a schema whose INPUT and
 * OUTPUT types are identical, so no `.default()`, `.transform()`, or
 * `z.coerce.*` may appear here. Raw query values are therefore validated as
 * strings and normalised by `normaliseListSocialAccountsQuery()` below, which
 * applies the approved pagination bounds (decision D8: 1..100, default 50, no
 * cursor in V1) in exactly one place.
 *
 * NOTE: query schemas are intentionally NOT `.strict()` - query strings
 * routinely carry unrelated parameters (cache-busting, analytics), so unknown
 * keys are ignored rather than rejected. Body DTOs remain `.strict()`, which is
 * where metadata-only enforcement matters.
 */
export const listSocialAccountsQuerySchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  take: z
    .string()
    .regex(/^[0-9]+$/, 'take must be a positive integer')
    .optional(),
});

export type ListSocialAccountsQueryDto = z.infer<
  typeof listSocialAccountsQuerySchema
>;

/** Approved pagination bounds (decision D8). */
export const DEFAULT_LIST_TAKE = 50;
export const MAX_LIST_TAKE = 100;

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
  const take = dto.take === undefined ? DEFAULT_LIST_TAKE : Number(dto.take);
  if (!Number.isInteger(take) || take < 1 || take > MAX_LIST_TAKE) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'ValidationError',
      message: `take must be between 1 and ${MAX_LIST_TAKE}`,
    });
  }

  return {
    platform: dto.platform,
    isActive: dto.isActive === undefined ? undefined : dto.isActive === 'true',
    take,
  };
}