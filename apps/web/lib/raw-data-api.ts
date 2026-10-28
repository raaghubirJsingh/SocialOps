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
import { contentApi } from './content-api';
import type {
  CreateRawDataRequest,
  ClientContentRequestDto,
  InternalNoteDto,
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

  getForClient: (clientId: string, rawDataId: string): Promise<RawDataDto> =>
    apiFetch<RawDataDto>(`/clients/${clientId}/raw-data/${rawDataId}`),

  // ---- client self-service scope ----
  listMine: (clientId: string): Promise<RawDataDto[]> =>
    apiFetch<RawDataDto[]>('/client/me/raw-data', {
      headers: { 'X-Client-Id': clientId },
    }),

  listContentRequestsMine: (
    clientId: string,
  ): Promise<ClientContentRequestDto[]> =>
    apiFetch<ClientContentRequestDto[]>('/client/me/raw-data/content-requests', {
      headers: { 'X-Client-Id': clientId },
    }),

  getContentRequestMine: (
    clientId: string,
    requestId: string,
  ): Promise<ClientContentRequestDto> =>
    apiFetch<ClientContentRequestDto>(
      `/client/me/raw-data/content-requests/${requestId}`,
      { headers: { 'X-Client-Id': clientId } },
    ),

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

  /**
   * Provenance for a manually initiated draft-from-intake (V1).
   *
   * The Content row is created FIRST through the existing Content create
   * mutation (server-forced DRAFT, server-resolved agencyId). This records
   * `Drafted from client intake <rawDataId>` as an agency-only Internal Note
   * on that Content via the existing internal-notes endpoint. RawData itself
   * is never mutated.
   */
  recordDraftProvenance: (
    clientId: string,
    contentId: string,
    rawDataId: string,
  ): Promise<InternalNoteDto> =>
    contentApi.createInternalNoteForClient(clientId, contentId, {
      body: `Drafted from client intake ${rawDataId}`,
    }),
};

/**
 * V1 prefill derivation for a manual draft-from-intake.
 *
 * Title: first meaningful (non-blank) line of extractedText, max 300 chars.
 * Body: full extractedText. Metadata is NEVER appended. scenarioType stays
 * unset (null) — the agency classifies it separately if needed.
 */
export function deriveDraftPrefill(intake: RawDataDto): {
  title: string;
  body: string;
} {
  const text = (intake.extractedText ?? '').replace(/\r\n/g, '\n');
  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  return {
    title: firstLine.slice(0, 300),
    body: text.trim(),
  };
}

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