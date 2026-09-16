import { ApiError } from './api';

/**
 * Human-readable messages for the backend's structured error codes.
 *
 * The Client Operations V1 endpoints answer with
 * `{ statusCode, error, message, code }`, so the UI can render precise copy
 * instead of a generic failure. Codes are mirrored from the backend services
 * (apps/api/src/content/content-status.service.ts and
 * apps/api/src/social-accounts/social-accounts.service.ts).
 *
 * IMPORTANT: the UI treats these as PRESENTATION only. A rejected action is a
 * normal outcome (the client-side status mirror can drift from the server), so
 * the caller must always surface the message and refetch - never assume the
 * optimistic state was correct.
 */
const CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  // social accounts
  DUPLICATE_SOCIAL_ACCOUNT:
    'That platform account is already recorded for this client.',
  // content status machine
  INVALID_CONTENT_TRANSITION:
    'That status change is not allowed from the current state.',
  TRANSITION_NOT_PERMITTED_FOR_ACTOR: 'Your role cannot perform this action.',
  CONTENT_UNDER_REVIEW:
    'Content under review cannot be edited. Withdraw it from review first.',
  CONTENT_ARCHIVED: 'Archived content cannot be edited.',
  CONTENT_REVISION_CONFLICT:
    'This content changed since it was loaded. Reload and try again.',
  CONFIRMATION_REQUIRED:
    'Final approval is granted only through Final Confirmation.',
  INVALID_CONTENT_STATUS:
    'Final confirmation requires the item to be in review.',
  ALREADY_CONFIRMED: 'This item already carries a final confirmation.',
});

const STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  400: 'The request was rejected. Check the values and try again.',
  401: 'Your session expired. Please sign in again.',
  403: 'Your account is not allowed to perform this action.',
  404: 'Not found in this organization or client scope.',
});

function codeOf(error: ApiError): string | null {
  const body = error.body;
  if (!body || typeof body !== 'object') return null;
  const code = (body as Record<string, unknown>).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/** Resolves the most specific available message for a failed request. */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code = codeOf(error);
    if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
    if (STATUS_MESSAGES[error.status]) return STATUS_MESSAGES[error.status];
    return error.message || fallback;
  }
  return fallback;
}