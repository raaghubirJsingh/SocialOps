import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Shared list-query plumbing for Client Operations V1.
 *
 * Approved pagination bounds (decision D8): `take` is 1..100 with a default of
 * 50, and there is no cursor in V1.
 *
 * The bounds live here so every list endpoint enforces exactly one rule. The
 * shared `ZodValidationPipe` requires a schema whose INPUT and OUTPUT types are
 * identical, so `take` is validated as a string and normalised by
 * `normaliseTake()` rather than through `.transform()`/`z.coerce.*`.
 */
export const DEFAULT_LIST_TAKE = 50;
export const MAX_LIST_TAKE = 100;

/** Shape-only `take` validator (query strings arrive as strings). */
export const takeQuerySchema = z
  .string()
  .regex(/^[0-9]+$/, 'take must be a positive integer')
  .optional();

/**
 * Normalises a validated `take` value. Server-side validation stays
 * authoritative: an out-of-range value is a 400, never a silent clamp.
 */
export function normaliseTake(value: string | undefined): number {
  const take = value === undefined ? DEFAULT_LIST_TAKE : Number(value);
  if (!Number.isInteger(take) || take < 1 || take > MAX_LIST_TAKE) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'ValidationError',
      message: `take must be between 1 and ${MAX_LIST_TAKE}`,
    });
  }
  return take;
}