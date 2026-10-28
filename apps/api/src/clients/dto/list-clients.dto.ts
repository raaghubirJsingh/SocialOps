import { z } from 'zod';

/**
 * List filters for the agency-side Clients list (GET /api/clients).
 *
 * Shape only: the shared `ZodValidationPipe` requires a schema whose INPUT
 * and OUTPUT types are identical, so no `.default()`, `.transform()`, or
 * `z.coerce.*` may appear here. The raw string is trimmed/normalised in
 * `normaliseListClientsQuery()` below.
 *
 * Query schemas are intentionally NOT `.strict()` - query strings routinely
 * carry unrelated parameters, so unknown keys are ignored rather than
 * rejected (mirrors list-content.dto.ts / list-social-accounts.dto.ts).
 *
 * `q` is a substring search term, bounded to 100 characters. It is used only
 * as a Prisma `contains` value (parameterised - never raw SQL) and never
 * logged or persisted.
 */
export const listClientsQuerySchema = z.object({
  q: z.string().max(100).optional(),
});

export type ListClientsQueryDto = z.infer<typeof listClientsQuerySchema>;

export interface ListClientsQuery {
  /** Trimmed, non-empty search term, or undefined for "no filter". */
  q?: string;
}

/**
 * Converts the validated raw query into a typed filter. Empty or
 * whitespace-only `q` normalises to `undefined`, so it behaves exactly like
 * the no-parameter call (server-side validation stays authoritative: an
 * over-length `q` is a 400 from the pipe, never a silent clamp).
 */
export function normaliseListClientsQuery(
  dto: ListClientsQueryDto,
): ListClientsQuery {
  const trimmed = dto.q?.trim();
  return { q: trimmed && trimmed.length > 0 ? trimmed : undefined };
}
