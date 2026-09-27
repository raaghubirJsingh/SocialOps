/**
 * S3-compatible object storage constants (approved AGENTS.md §13 override).
 *
 * Tenant isolation (AGENTS.md §6-§7): every object key MUST carry the
 * `{organizationId}/{clientId}/raw-data/` prefix. The prefix is always
 * constructed SERVER-side from verified context - never from request input -
 * so a caller can never address another tenant's prefix.
 */

/**
 * MIME types accepted for raw-data uploads. Deliberately narrow: raw intake
 * material is documents and images, not arbitrary binaries.
 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedUploadContentType = (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

/** Narrowing guard mirroring the Zod enum on the server. */
export function isAllowedUploadContentType(
  value: string,
): value is AllowedUploadContentType {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Canonical object-key extension per allowed content type. The extension is
 * derived SERVER-side from the validated content type - the client-supplied
 * filename never reaches the object key, so a crafted name cannot smuggle
 * path segments or double extensions.
 */
export const CONTENT_TYPE_EXTENSIONS: Record<AllowedUploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Hard upload ceiling: 10 MiB per object. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Presigned URL lifetime. Default 15 minutes when env is absent. */
export const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 900;

/** Required key prefix for raw-data objects, relative to the tenant root. */
export const RAW_DATA_KEY_SEGMENT = 'raw-data';