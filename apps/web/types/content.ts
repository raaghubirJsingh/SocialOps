/**
 * Content + RawData types (Client Operations V1).
 *
 * MIRRORS the backend SELECT allowlists in apps/api/src/content/content.select.ts
 * (CONTENT_SELECT / CONTENT_REVISION_SELECT / CONTENT_STATUS_EVENT_SELECT /
 * RAW_DATA_SELECT) and the approved schema (docs/APPROVED_DECISIONS.md
 * Decision 008).
 *
 * State is SERVER-OWNED: `status`, the confirmation triple, and the integrity
 * hashes are never sent by the UI. The import/creation payload types below
 * deliberately cannot express them.
 */

/**
 * Approved V1 Content statuses (Decision 009). Publishing is still deferred, so
 * there is no PUBLISHED/SCHEDULED value - APPROVED is terminal in V1.
 */
export const CONTENT_STATUSES = Object.freeze([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ARCHIVED',
] as const);

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Readonly<Record<ContentStatus, string>> =
  Object.freeze({
    DRAFT: 'Draft',
    IN_REVIEW: 'In review',
    CHANGES_REQUESTED: 'Changes requested',
    APPROVED: 'Approved',
    ARCHIVED: 'Archived',
  });

/** Targets accepted by the GENERIC status route (never APPROVED or DRAFT). */
export const CONTENT_TRANSITION_TARGETS = Object.freeze([
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'ARCHIVED',
] as const);

export type ContentTransitionTarget =
  (typeof CONTENT_TRANSITION_TARGETS)[number];

/** The two authorized actor roles (mirrors the backend authority table). */
export type ContentActor = 'AGENCY_ADMIN' | 'CLIENT_OWNER';

export interface ContentDto {
  id: string;
  clientId: string;
  title: string;
  body: string;
  status: ContentStatus;
  finalConfirmedAt: string | null;
  finalConfirmedByUserId: string | null;
  finalConfirmedRevisionId: string | null;
  archivedAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Insert-only snapshot (immutable): the confirmation pins one of these. */
export interface ContentRevisionDto {
  id: string;
  contentId: string;
  clientId: string;
  revision: number;
  title: string;
  body: string;
  contentHash: string;
  createdByUserId: string | null;
  createdAt: string;
}

/** Append-only status transition event. */
export interface ContentStatusEventDto {
  id: string;
  contentId: string;
  clientId: string;
  fromStatus: ContentStatus | null;
  toStatus: ContentStatus;
  actorUserId: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
}

export const RAW_DATA_SOURCES = Object.freeze([
  'CLIENT_UPLOAD',
  'CLIENT_FORM',
  'AGENCY_UPLOAD',
  'EXTERNAL_IMPORT',
] as const);

export type RawDataSource = (typeof RAW_DATA_SOURCES)[number];

export const RAW_DATA_SOURCE_LABELS: Readonly<Record<RawDataSource, string>> =
  Object.freeze({
    CLIENT_UPLOAD: 'Client upload',
    CLIENT_FORM: 'Client form',
    AGENCY_UPLOAD: 'Agency upload',
    EXTERNAL_IMPORT: 'External import',
  });

export interface RawDataDto {
  id: string;
  clientId: string;
  source: RawDataSource;
  contentId: string | null;
  mimeType: string | null;
  originalFileName: string | null;
  extractedText: string | null;
  metadata: unknown;
  contentHash: string;
  byteSize: number | null;
  capturedAt: string;
  capturedByUserId: string | null;
  createdAt: string;
}

/** `status` is never accepted: every item is born DRAFT. */
export interface CreateContentRequest {
  title: string;
  body: string;
}

export interface UpdateContentRequest {
  title?: string;
  body?: string;
  /** Optional optimistic concurrency (approved D5). */
  expectedRevision?: number;
}

export interface TransitionContentRequest {
  to: ContentTransitionTarget;
  note?: string;
}

export interface ConfirmFinalRequest {
  note?: string;
}

/**
 * RawData intake. `contentHash` and `storageRef` are deliberately absent: the
 * hash is computed server-side and object storage is deferred (no file upload).
 */
export interface CreateRawDataRequest {
  source: RawDataSource;
  contentId?: string;
  mimeType?: string | null;
  originalFileName?: string | null;
  extractedText?: string | null;
  metadata?: Record<string, unknown> | null;
  byteSize?: number | null;
}