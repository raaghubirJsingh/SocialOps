import { env } from './env';
import { loadSession } from './session-storage';

/**
 * Typed fetch wrapper for the SocialOps REST API.
 *
 * This is a thin, deliberate wrapper over `fetch`:
 *   - prepends the configured API base URL,
 *   - serialises JSON bodies,
 *   - attaches `Content-Type: application/json` by default,
 *   - attaches `Accept: application/json`,
 *   - returns the parsed JSON response or throws an `ApiError`.
 *
 * It does NOT do any retry or caching - those concerns belong to
 * TanStack Query and the auth-client.
 *
 * Authentication: when a session exists in localStorage, apiFetch
 * attaches `Authorization: Bearer <accessToken>` automatically -
 * UNLESS the caller already supplied an explicit `Authorization`
 * header (e.g. auth-client's logout(), which must send its own token).
 *
 * AGENTS.md §8: no server secrets reach the frontend. The access
 * token is the signed-in user's own JWT returned by the backend at
 * login; the frontend never holds or sends a server-side secret.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ApiFetchInit = Omit<RequestInit, 'body'> & {
  /** Plain object body. Will be JSON-stringified. */
  body?: unknown;
  /** Extra headers merged on top of the defaults. */
  headers?: Record<string, string>;
};

// Module-level active-organization registry.
//
// The backend's global `OrganizationMembershipGuard` requires
// `X-Organization-Id` on every non-public route and re-verifies the
// (userId, organizationId) membership + Organization.isActive
// server-side on every call (AGENTS.md §6-§7). This registry only
// spares callers from repeating the header - it is a UI convenience,
// never a security boundary. It mirrors the session-bearer pattern:
// a leaf-module variable kept in sync by the provider hook, with
// caller-supplied headers always winning.
let activeOrganizationId: string | null = null;

export function setActiveOrganizationIdHeader(id: string | null): void {
  activeOrganizationId = id;
}

export async function apiFetch<TResponse>(
  path: string,
  init: ApiFetchInit = {},
): Promise<TResponse> {
  const { body, headers, ...rest } = init;

  // A caller may already provide an Authorization header explicitly
  // (auth-client's logout() sends the exact token it was given).
  // Detect that case-insensitively so the session-injected bearer
  // never overwrites it.
  const callerHeaders = (headers ?? {}) as Record<string, string>;
  const callerSetAuthorization = Object.keys(callerHeaders).some(
    (key) => key.toLowerCase() === 'authorization',
  );

  // Attach the signed-in user's access token from localStorage when
  // a session exists and the caller did not provide one.
  const session = loadSession();
  const sessionAuthHeader: Record<string, string> =
    session && !callerSetAuthorization
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {};

  // Attach the active organization context unless the caller supplied
  // its own `X-Organization-Id` (detected case-insensitively, same as
  // the Authorization header above).
  const callerSetOrgHeader = Object.keys(callerHeaders).some(
    (key) => key.toLowerCase() === 'x-organization-id',
  );
  const organizationHeader: Record<string, string> =
    !callerSetOrgHeader && activeOrganizationId
      ? { 'X-Organization-Id': activeOrganizationId }
      : {};

  // We coerce the headers into a plain `Record<string, string>`
  // because the optional spread widens the type under strict mode.
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...callerHeaders,
    ...sessionAuthHeader,
    ...organizationHeader,
  };

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // The API returns no body for some 204 responses. Don't try to parse it.
  const text = response.status === 204 ? '' : await response.text();
  const parsed: unknown = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const message = extractErrorMessage(parsed) ?? response.statusText;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as TResponse;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const message = record.message;
  if (typeof message === 'string' && message.length > 0) return message;
  const error = record.error;
  if (typeof error === 'string' && error.length > 0) return error;
  return undefined;
}
