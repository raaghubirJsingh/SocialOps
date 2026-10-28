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
  ChangeRequestDto,
  ClientContentViewDto,
  ConfirmFinalRequest,
  ContentDto,
  ContentRevisionDto,
  ContentStatus,
  ContentStatusEventDto,
  CreateChangeRequestRequest,
  CreateContentRequest,
  InternalNoteDto,
  ProcessAiTaskRequest,
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

  createFromRequestForClient: (
    clientId: string,
    requestId: string,
    body: CreateContentRequest,
  ): Promise<ContentDto> =>
    apiFetch<ContentDto>(
      `/clients/${clientId}/content/from-request/${requestId}`,
      { method: 'POST', body },
    ),

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

  /**
   * Phase 2: dispatch a task to an AI employee (agency only, OWNER/ADMIN).
   * The AI User must hold MEMBER in this org; the backend re-verifies.
   */
  processAiTaskForClient: (
    clientId: string,
    contentId: string,
    body: ProcessAiTaskRequest,
  ): Promise<ContentRevisionDto | InternalNoteDto> =>
    apiFetch<ContentRevisionDto | InternalNoteDto>(
      `/clients/${clientId}/content/${contentId}/ai-tasks`,
      { method: 'POST', body },
    ),

  /** Phase 2: agency view of change requests for one item. */
  changeRequestsForClient: (
    clientId: string,
    contentId: string,
  ): Promise<ChangeRequestDto[]> =>
    apiFetch<ChangeRequestDto[]>(
      `/clients/${clientId}/content/${contentId}/change-requests`,
    ),

  /** Phase 2: agency-only internal notes (never exposed to clients). */
  internalNotesForClient: (
    clientId: string,
    contentId: string,
  ): Promise<InternalNoteDto[]> =>
    apiFetch<InternalNoteDto[]>(
      `/clients/${clientId}/content/${contentId}/internal-notes`,
    ),

  /** Agency-only internal note creation (MEMBER+, non-destructive commentary). */
  createInternalNoteForClient: (
    clientId: string,
    contentId: string,
    body: { body: string },
  ): Promise<InternalNoteDto> =>
    apiFetch<InternalNoteDto>(
      `/clients/${clientId}/content/${contentId}/internal-notes`,
      { method: 'POST', body },
    ),

  // ---- client self-service scope ----
  listMine: (
    clientId: string,
    status?: ContentStatus,
  ): Promise<ClientContentViewDto[]> =>
    apiFetch<ClientContentViewDto[]>(`/client/me/content${statusQuery(status)}`, {
      headers: { 'X-Client-Id': clientId },
    }),

  createMine: (
    clientId: string,
    body: CreateContentRequest,
  ): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>('/client/me/content', {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  getMine: (clientId: string, contentId: string): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>(`/client/me/content/${contentId}`, {
      headers: { 'X-Client-Id': clientId },
    }),

  updateMine: (
    clientId: string,
    contentId: string,
    body: UpdateContentRequest,
  ): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>(`/client/me/content/${contentId}`, {
      method: 'PATCH',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  transitionMine: (
    clientId: string,
    contentId: string,
    body: TransitionContentRequest,
  ): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>(`/client/me/content/${contentId}/status`, {
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

  /**
   * FINAL CONFIRMATION - the only door to APPROVED (CLIENT OWNER only).
   * Writes the confirmation triple atomically with an immutable revision.
   */
  confirmFinalMine: (
    clientId: string,
    contentId: string,
    body: ConfirmFinalRequest,
  ): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>(
      `/client/me/content/${contentId}/final-confirmation`,
      { method: 'POST', body, headers: { 'X-Client-Id': clientId } },
    ),

  /**
   * Phase 2 FINAL LOCK - the only door to FINAL_CONFIRMED (client owner).
   * Immutable afterwards: no edits, revisions, or change requests.
   */
  confirmFinalLockMine: (
    clientId: string,
    contentId: string,
    body: ConfirmFinalRequest,
  ): Promise<ClientContentViewDto> =>
    apiFetch<ClientContentViewDto>(
      `/client/me/content/${contentId}/final-confirmed-lock`,
      { method: 'POST', body, headers: { 'X-Client-Id': clientId } },
    ),

  /** Phase 2: client submits a change request (SCENARIO_1 max 2). */
  createChangeRequestMine: (
    clientId: string,
    contentId: string,
    body: CreateChangeRequestRequest,
  ): Promise<ChangeRequestDto> =>
    apiFetch<ChangeRequestDto>(
      `/client/me/content/${contentId}/change-requests`,
      { method: 'POST', body, headers: { 'X-Client-Id': clientId } },
    ),

  /** Phase 2: client view of change requests for one item. */
  changeRequestsMine: (
    clientId: string,
    contentId: string,
  ): Promise<ChangeRequestDto[]> =>
    apiFetch<ChangeRequestDto[]>(
      `/client/me/content/${contentId}/change-requests`,
      { headers: { 'X-Client-Id': clientId } },
    ),
};