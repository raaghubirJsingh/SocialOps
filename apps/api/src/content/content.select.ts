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