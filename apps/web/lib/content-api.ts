/**
 * Content API client (Client Operations V1).
 *
 * Mirrors apps/api/src/content. Agency methods use the org-scoped routes (the
 * verified `X-Organization-Id` is attached by apiFetch); client methods use the
 * self-service `/client/me/...` routes with an explicit `X-Client-Id`.
 *
 * `confirmFinalMine` is the ONLY method in this file that can move an item to
 * APPROVED, and it exists only on the client self-service scope - there is no
 * agency equivalent, because Final Confirmation is CLIENT OWNER only (D4). The
 * server enforces this regardless of what the UI renders.
 *
 * `status` is never sent when creating: every item is born DRAFT.
 */
import { apiFetch } from './api';
import type {
  ConfirmFinalRequest,
  ContentDto,
  ContentRevisionDto,
  ContentStatus,
  ContentStatusEventDto,
  CreateContentRequest,
  TransitionContentRequest,
  UpdateContentRequest,
} from '@/types/content';

const statusQuery = (status?: ContentStatus) =>
  status ? `?status=${status}` : '';

export const contentApi = {
  // ---- agency scope ----
  listForClient: (
    clientId: string,
    status?: ContentStatus,
  ): Promise<ContentDto[]> =>
    apiFetch<ContentDto[]>(
      `/clients/${clientId}/content${statusQuery(status)}`,
    ),

  createForClient: (
    clientId: string,
    body: CreateContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/clients/${clientId}/content`, {
      method: 'POST',
      body,
    }),

  getForClient: (clientId: string, contentId: string): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/clients/${clientId}/content/${contentId}`),

  updateForClient: (
    clientId: string,
    contentId: string,
    body: UpdateContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/clients/${clientId}/content/${contentId}`, {
      method: 'PATCH',
      body,
    }),

  transitionForClient: (
    clientId: string,
    contentId: string,
    body: TransitionContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/clients/${clientId}/content/${contentId}/status`, {
      method: 'POST',
      body,
    }),

  revisionsForClient: (
    clientId: string,
    contentId: string,
  ): Promise<ContentRevisionDto[]> =>
    apiFetch<ContentRevisionDto[]>(
      `/clients/${clientId}/content/${contentId}/revisions`,
    ),

  statusEventsForClient: (
    clientId: string,
    contentId: string,
  ): Promise<ContentStatusEventDto[]> =>
    apiFetch<ContentStatusEventDto[]>(
      `/clients/${clientId}/content/${contentId}/status-events`,
    ),

  // ---- client self-service scope ----
  listMine: (clientId: string, status?: ContentStatus): Promise<ContentDto[]> =>
    apiFetch<ContentDto[]>(`/client/me/content${statusQuery(status)}`, {
      headers: { 'X-Client-Id': clientId },
    }),

  createMine: (
    clientId: string,
    body: CreateContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>('/client/me/content', {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  getMine: (clientId: string, contentId: string): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/client/me/content/${contentId}`, {
      headers: { 'X-Client-Id': clientId },
    }),

  updateMine: (
    clientId: string,
    contentId: string,
    body: UpdateContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/client/me/content/${contentId}`, {
      method: 'PATCH',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  transitionMine: (
    clientId: string,
    contentId: string,
    body: TransitionContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(`/client/me/content/${contentId}/status`, {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  revisionsMine: (
    clientId: string,
    contentId: string,
  ): Promise<ContentRevisionDto[]> =>
    apiFetch<ContentRevisionDto[]>(
      `/client/me/content/${contentId}/revisions`,
      { headers: { 'X-Client-Id': clientId } },
    ),

  statusEventsMine: (
    clientId: string,
    contentId: string,
  ): Promise<ContentStatusEventDto[]> =>
    apiFetch<ContentStatusEventDto[]>(
      `/client/me/content/${contentId}/status-events`,
      { headers: { 'X-Client-Id': clientId } },
    ),

  /**
   * FINAL CONFIRMATION - the only door to APPROVED (CLIENT OWNER only).
   * Writes the confirmation triple atomically with an immutable revision.
   */
  confirmFinalMine: (
    clientId: string,
    contentId: string,
    body: ConfirmFinalRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(
      `/client/me/content/${contentId}/final-confirmation`,
      { method: 'POST', body, headers: { 'X-Client-Id': clientId } },
    ),
};