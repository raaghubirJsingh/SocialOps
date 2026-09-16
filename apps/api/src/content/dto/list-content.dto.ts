import type { ContentStatus } from '@prisma/client';
import { z } from 'zod';

import { normaliseTake, takeQuerySchema } from '../../common/list-query.js';
import { CONTENT_STATUSES } from '../constants/content-transitions.js';

/**
 * List filters for Content. Shape only (the shared `ZodValidationPipe`
 * requires input and output types to be identical), with the approved
 * pagination bounds applied by `normaliseListContentQuery()`.
 *
 * Query schemas are intentionally NOT `.strict()`: unrelated query parameters
 * are ignored rather than rejected.
 */
export const listContentQuerySchema = z.object({
  status: z.enum(CONTENT_STATUSES).optional(),
  take: takeQuerySchema,
});

export type ListContentQueryDto = z.infer<typeof listContentQuerySchema>;

export interface ListContentQuery {
  status?: ContentStatus;
  take: number;
}

export function normaliseListContentQuery(
  dto: ListContentQueryDto,
): ListContentQuery {
  return { status: dto.status, take: normaliseTake(dto.take) };
}