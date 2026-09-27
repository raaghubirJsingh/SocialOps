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
 * Approved Content statuses (Client Operations V1 + Phase 2 pipeline).
 *
 * V1: DRAFT / IN_REVIEW / CHANGES_REQUESTED / APPROVED / ARCHIVED.
 * Phase 2 adds the 3-scenario pipeline states: AWAITING_MANAGER_APPROVAL,
 * UNDER_CLIENT_REVIEW, FINAL_CONFIRMED. Publishing is still deferred, so
 * there is no PUBLISHED/SCHEDULED value. Source of truth for the machine is
 * apps/api/src/content/constants/content-transitions.ts; the server enforces
 * every edge and the UI mirror is presentation only (AGENTS.md §7).
 */
export const CONTENT_STATUSES = Object.freeze([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ARCHIVED',
  // Phase 2 pipeline states
  'AWAITING_MANAGER_APPROVAL',
  'UNDER_CLIENT_REVIEW',
  'FINAL_CONFIRMED',
] as const);

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Readonly<Record<ContentStatus, string>> =
  Object.freeze({
    DRAFT: 'Draft',
    IN_REVIEW: 'In review',
    CHANGES_REQUESTED: 'Changes requested',
    APPROVED: 'Approved',
    ARCHIVED: 'Archived',
    AWAITING_MANAGER_APPROVAL: 'Awaiting manager approval',
    UNDER_CLIENT_REVIEW: 'Under client review',
    FINAL_CONFIRMED: 'Final confirmed',
  });

/**
 * Targets accepted by the GENERIC status route.
 * APPROVED, FINAL_CONFIRMED and DRAFT are never generic targets (dedicated
 * doors only). Mirrors backend TRANSITION_TARGETS.
 */
export const CONTENT_TRANSITION_TARGETS = Object.freeze([
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'ARCHIVED',
  'AWAITING_MANAGER_APPROVAL',
  'UNDER_CLIENT_REVIEW',
] as const);

export type ContentTransitionTarget =
  (typeof CONTENT_TRANSITION_TARGETS)[number];

/** Scenario pipeline tag (Phase 2). NULL means unclassified. */
export type ScenarioType = 'SCENARIO_1' | 'SCENARIO_2' | 'SCENARIO_3';

/** The two authorized actor roles (mirrors the backend authority table). */
export type ContentActor = 'AGENCY_ADMIN' | 'CLIENT_OWNER';

export interface ContentDto {
  id: string;
  clientId: string;
  title: string;
  body: string;
  status: ContentStatus;
  scenarioType: ScenarioType | null;
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

/** Phase 2: dispatch a task to an AI employee (agency only). */
export interface ProcessAiTaskRequest {
  /** AI User id (UUID, isBot=true, MEMBER of the agency org). */
  aiUserId: string;
  prompt: string;
  outputType: 'revision' | 'internal-note';
}

/** Phase 2: client-submitted change request payload. */
export interface CreateChangeRequestRequest {
  requestDetails: string;
}

export interface ChangeRequestDto {
  id: string;
  contentId: string;
  requestedById: string;
  requestDetails: string;
  createdAt: string;
}

export interface InternalNoteDto {
  id: string;
  contentId: string;
  agencyId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

/**
 * RawData intake. `contentHash` is never sent - the server computes it.
 *
 * `storageRef` / `byteSize` / `mimeType` are only set when a file was actually
 * uploaded through the presigned-PUT flow. The server re-validates the
 * tenant prefix AND verifies the object exists at the declared size/type
 * before persisting the immutable record.
 */
export interface CreateRawDataRequest {
  source: RawDataSource;
  contentId?: string;
  mimeType?: string | null;
  originalFileName?: string | null;
  extractedText?: string | null;
  metadata?: Record<string, unknown> | null;
  byteSize?: number | null;
  storageRef?: string | null;
}

/* -------------------------------------------------------------------------
 * Presigned upload (approved AGENTS.md §13 override, zero-buffer).
 *
 * The browser PUTs the bytes straight to object storage. The backend never
 * sees file content - only metadata.
 * ---------------------------------------------------------------------- */

/** Mirrors the server allowlist in apps/api/src/s3/s3.constants.ts. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedUploadContentType =
  (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

/** Hard ceiling per object; mirrors MAX_UPLOAD_BYTES on the server. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isAllowedUploadContentType(
  value: string,
): value is AllowedUploadContentType {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Metadata-only request body for the presigned-PUT endpoint. */
export interface PresignedUploadRequest {
  filename: string;
  contentType: AllowedUploadContentType;
  contentLength: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

/** What the browser needs to attach to the intake record. */
export interface UploadedFileRef {
  storageRef: string;
  byteSize: number;
  mimeType: AllowedUploadContentType;
  originalFileName: string;
}