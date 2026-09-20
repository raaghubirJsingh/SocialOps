import { z } from 'zod';

import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_CONTENT_TYPES } from '../s3.constants.js';

/**
 * Presigned PUT URL request payload.
 *
 * Carries upload METADATA only - never file bytes (zero-buffer contract).
 * The tenant identity is NOT part of the body: the clientId comes from the
 * verified route context (URL param on the agency route, ClientAccessGuard
 * binding on the client route) and the organizationId from either the
 * verified organization context or the ACTIVE ClientAgencyRelationship.
 */
export const presignedUploadSchema = z
  .object({
    /** Original filename. Used for audit/display only - never the object key. */
    filename: z
      .string()
      .min(1, 'Filename is required')
      .max(255, 'Filename must be 255 characters or fewer'),
    contentType: z.enum(ALLOWED_UPLOAD_CONTENT_TYPES, {
      errorMap: () => ({ message: 'Unsupported content type' }),
    }),
    /** Exact object size in bytes; enforced against the hard ceiling. */
    contentLength: z
      .number()
      .int()
      .positive('Content length must be positive')
      .max(MAX_UPLOAD_BYTES, 'File exceeds the maximum upload size'),
  })
  .strict();

export type PresignedUploadDto = z.infer<typeof presignedUploadSchema>;

/** Response body for POST upload-url endpoints. */
export interface PresignedUploadResult {
  /** Short-lived presigned PUT URL. The browser uploads DIRECTLY to S3. */
  uploadUrl: string;
  /**
   * The internal S3 object key with the tenant prefix
   * `{organizationId}/{clientId}/raw-data/{uuid}.{ext}`. This - never a
   * URL - is what the client submits as `storageRef` on intake creation.
   */
  objectKey: string;
  /** Presigned URL lifetime in seconds. */
  expiresIn: number;
}