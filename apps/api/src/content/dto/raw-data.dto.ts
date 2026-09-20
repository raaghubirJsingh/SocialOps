import { z } from 'zod';

import { normaliseTake, takeQuerySchema } from '../../common/list-query.js';

/**
 * RawData intake payload (Client Operations V1).
 *
 * INSERT-ONLY intake: there is no update or delete route for RawData anywhere
 * in this module. Field contract:
 *   - `contentHash` - always computed SERVER-side (`rawDataHashOf`), because a
 *     caller-supplied integrity hash would be meaningless;
 *   - `storageRef`  - OPTIONAL internal S3 object key (approved AGENTS.md §13
 *     override). Only keys minted by `POST .../upload-url` are accepted; the
 *     service validates the `{organizationId}/{clientId}/raw-data/` prefix and
 *     rejects any URL-shaped value, so the column can never hold a public URL.
 *
 * `extractedText` and/or `metadata` still carry the textual payload; binary
 * bytes never pass through the API (zero-buffer, presigned PUT only).
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
    /**
     * Internal S3 object key issued by the upload-url endpoint. Never a URL;
     * tenant-prefix and shape are re-validated server-side in RawDataService.
     */
    storageRef: z.string().min(1).max(1024).optional(),
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