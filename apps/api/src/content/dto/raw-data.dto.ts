import { z } from 'zod';

import { normaliseTake, takeQuerySchema } from '../../common/list-query.js';

/**
 * RawData intake payload (Client Operations V1).
 *
 * INSERT-ONLY intake: there is no update or delete route for RawData anywhere
 * in this module. Two fields are deliberately absent from this contract:
 *   - `contentHash` - always computed SERVER-side (`rawDataHashOf`), because a
 *     caller-supplied integrity hash would be meaningless;
 *   - `storageRef`   - reserved for the deferred S3-compatible storage phase
 *     and never accepted from a client (AGENTS.md section 13).
 *
 * `extractedText` and/or `metadata` carry the payload; binary storage is
 * deferred, so V1 stores text and structured metadata only.
 */
export const RAW_DATA_SOURCES = [
  'CLIENT_UPLOAD',
  'CLIENT_FORM',
  'AGENCY_UPLOAD',
  'EXTERNAL_IMPORT',
] as const;

export const createRawDataSchema = z
  .object({
    source: z.enum(RAW_DATA_SOURCES),
    contentId: z.string().uuid().optional(),
    mimeType: z.string().min(1).max(100).nullish(),
    originalFileName: z.string().min(1).max(255).nullish(),
    extractedText: z.string().max(1_000_000).nullish(),
    metadata: z.record(z.unknown()).nullish(),
    byteSize: z.number().int().nonnegative().nullish(),
  })
  .strict();

export type CreateRawDataDto = z.infer<typeof createRawDataSchema>;

export const listRawDataQuerySchema = z.object({
  source: z.enum(RAW_DATA_SOURCES).optional(),
  take: takeQuerySchema,
});

export type ListRawDataQueryDto = z.infer<typeof listRawDataQuerySchema>;

export interface ListRawDataQuery {
  source?: (typeof RAW_DATA_SOURCES)[number];
  take: number;
}

export function normaliseListRawDataQuery(
  dto: ListRawDataQueryDto,
): ListRawDataQuery {
  return { source: dto.source, take: normaliseTake(dto.take) };
}