/**
 * RawData API client (Client Operations V1) - INSERT-ONLY.
 *
 * There is deliberately NO update or delete method: the backend exposes no such
 * route (intake records are immutable provenance), so the UI cannot even offer
 * one. `contentHash` is never sent - the server computes it from the payload it
 * receives.
 *
 * Presigned upload (zero-buffer): `createUploadUrl*` mints a short-lived PUT URL
 * carrying METADATA only. The BYTES are then PUT directly to object storage by
 * `uploadFileBytes` below - deliberately NOT through `apiFetch`, so the session
 * bearer token and `X-Organization-Id` are never sent to the storage vendor.
 */
import { apiFetch } from './api';
import type {
  CreateRawDataRequest,
  PresignedUploadRequest,
  PresignedUploadResponse,
  RawDataDto,
  UploadedFileRef,
} from '@/types/content';

export const rawDataApi = {
  // ---- agency scope (organization context attached by apiFetch) ----
  listForClient: (clientId: string): Promise<RawDataDto[]> =>
    apiFetch<RawDataDto[]>(`/clients/${clientId}/raw-data`),

  createForClient: (
    clientId: string,
    body: CreateRawDataRequest,
  ): Promise<RawDataDto> =>
    apiFetch<RawDataDto>(`/clients/${clientId}/raw-data`, {
      method: 'POST',
      body,
    }),

  // ---- client self-service scope ----
  listMine: (clientId: string): Promise<RawDataDto[]> =>
    apiFetch<RawDataDto[]>('/client/me/raw-data', {
      headers: { 'X-Client-Id': clientId },
    }),

  createMine: (
    clientId: string,
    body: CreateRawDataRequest,
  ): Promise<RawDataDto> =>
    apiFetch<RawDataDto>('/client/me/raw-data', {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  /* ---- presigned upload (zero-buffer) ---- */

  /**
   * Agency upload-url mint. NO tenant header here: apiFetch attaches the
   * verified `X-Organization-Id`, and the backend proves the ACTIVE
   * ClientAgencyRelationship plus the ADMIN role.
   */
  createUploadUrlForClient: (
    clientId: string,
    body: PresignedUploadRequest,
  ): Promise<PresignedUploadResponse> =>
    apiFetch<PresignedUploadResponse>(
      `/clients/${clientId}/raw-data/upload-url`,
      { method: 'POST', body },
    ),

  /**
   * Client self-service upload-url mint. Tenant context is the EXPLICIT
   * `X-Client-Id` header; the backend re-verifies the binding and requires an
   * ACTIVE managing agency to resolve the object-key prefix.
   */
  createUploadUrlMine: (
    clientId: string,
    body: PresignedUploadRequest,
  ): Promise<PresignedUploadResponse> =>
    apiFetch<PresignedUploadResponse>('/client/me/raw-data/upload-url', {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),
};

/**
 * PUT the file bytes straight to object storage.
 *
 * SECURITY: this intentionally uses the global `fetch`, NOT `apiFetch`.
 * `apiFetch` attaches the Authorization bearer token and the
 * `X-Organization-Id` tenant header; sending either to the storage vendor
 * would leak the session to a third party and is the single most important
 * rule in this flow.
 *
 * `Content-Type` must match the value the URL was signed with, and the body
 * length must match the declared one - both are pinned into the signature, so
 * a mismatch is rejected at the bucket rather than silently accepted.
 */
export async function uploadFileBytes(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<UploadedFileRef> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error(
      `Upload failed (${response.status}). Please check your connection and try again.`,
    );
  }
  return {
    // storageRef is filled in by the caller from the minted objectKey.
    storageRef: '',
    byteSize: file.size,
    mimeType: contentType as UploadedFileRef['mimeType'],
    originalFileName: file.name,
  };
}