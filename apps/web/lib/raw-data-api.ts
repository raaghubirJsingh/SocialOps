/**
 * RawData API client (Client Operations V1) - INSERT-ONLY.
 *
 * There is deliberately NO update or delete method: the backend exposes no such
 * route (intake records are immutable provenance), so the UI cannot even offer
 * one. `contentHash` is never sent - the server computes it from the payload it
 * receives - and `storageRef` is not accepted in this phase because
 * S3-compatible storage is deferred. No file upload exists here; V1 intake is
 * pasted text and/or structured metadata.
 */
import { apiFetch } from './api';
import type { CreateRawDataRequest, RawDataDto } from '@/types/content';

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
};