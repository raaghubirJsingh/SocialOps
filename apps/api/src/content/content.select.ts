/**
 * Response allowlists for Content Operations V1 reads.
 *
 * Centralised so the wire contract cannot drift between the agency and client
 * controllers. Everything listed is non-secret by construction; the immutable
 * revision and append-only event rows are exposed by their own selections.
 */
export const CONTENT_SELECT = {
  id: true,
  clientId: true,
  title: true,
  body: true,
  status: true,
  // Phase 2: scenario and agency tracking
  scenarioType: true,
  agencyId: true,
  finalConfirmedAt: true,
  finalConfirmedByUserId: true,
  finalConfirmedRevisionId: true,
  archivedAt: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Client-safe Content SELECT: NEVER includes an agency-internal column.
 *
 * Excluded by construction (Phase 2 strict data boundary):
 *   - `internalNotes` - the Agency-only discussion / AI commentary thread;
 *   - `agencyId` - the managing Agency's Organization id.
 *
 * The interceptor layer (ClientBoundaryInterceptor) strips the same keys again
 * if they ever arrive from a nested relation, so a single SELECT mistake cannot
 * leak agency internals to a Client.
 */
export const CLIENT_CONTENT_SELECT = {
  id: true,
  clientId: true,
  title: true,
  body: true,
  status: true,
  scenarioType: true,
  finalConfirmedAt: true,
  finalConfirmedByUserId: true,
  finalConfirmedRevisionId: true,
  archivedAt: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const CONTENT_REVISION_SELECT = {
  id: true,
  contentId: true,
  clientId: true,
  revision: true,
  title: true,
  body: true,
  contentHash: true,
  createdByUserId: true,
  createdAt: true,
} as const;

export const CONTENT_STATUS_EVENT_SELECT = {
  id: true,
  contentId: true,
  clientId: true,
  fromStatus: true,
  toStatus: true,
  actorUserId: true,
  actorRole: true,
  note: true,
  createdAt: true,
} as const;

export const RAW_DATA_SELECT = {
  id: true,
  clientId: true,
  source: true,
  contentId: true,
  mimeType: true,
  originalFileName: true,
  extractedText: true,
  metadata: true,
  contentHash: true,
  byteSize: true,
  capturedAt: true,
  capturedByUserId: true,
  createdAt: true,
} as const;

/**
 * InternalNote SELECT - AGENCY ONLY. These rows must NEVER be returned to a
 * Client. The InternalNoteService enforces this at the query level
 * (agencyId filter), and the ClientBoundaryInterceptor strips any leaked data.
 */
export const INTERNAL_NOTE_SELECT = {
  id: true,
  contentId: true,
  agencyId: true,
  authorId: true,
  body: true,
  createdAt: true,
} as const;

/**
 * ChangeRequest SELECT - visible to both Agency and the requesting Client.
 */
export const CHANGE_REQUEST_SELECT = {
  id: true,
  contentId: true,
  requestedById: true,
  requestDetails: true,
  createdAt: true,
} as const;