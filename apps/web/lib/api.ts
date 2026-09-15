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
 * It does NOT do general retry or caching - those concerns belong to
 * TanStack Query and the auth-client. The ONE exception is auth
 * recovery, owned here because apiFetch is the single choke point:
 *   - 401 on a non-`/auth/*` route triggers a SINGLE-FLIGHT refresh
 *     (via the invoker registered by SessionProvider) followed by
 *     exactly one retry of the original request with the fresh token.
 *   - 403 responses matching the backend "organization context lost"
 *     contract clear the active organization (module registry + listener
 *     to ActiveOrganizationProvider) so the user re-picks an organization.
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
  /**
   * INTERNAL: set by apiFetch's own 401 recovery retry so the original
   * request is refreshed and retried at most once. Never set by callers.
   */
  authRetryDone?: boolean;
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

// ---------------------------------------------------------------------------
// Recovery registries.
//
// Inverted dependencies, mirroring the activeOrganizationId registry above:
// api.ts must NOT import auth-client (auth-client imports api.ts), so the
// session owner (SessionProvider) and org owner (ActiveOrganizationProvider)
// register their handlers here at mount time.
// ---------------------------------------------------------------------------

/**
 * Invokes exactly one refresh round-trip (POST /api/auth/refresh via
 * auth-client.refreshAccessToken). Resolves true when a fresh session was
 * persisted to localStorage; false when there is no session or the refresh
 * failed (the session has been cleared in that case).
 */
type RefreshInvoker = () => Promise<boolean>;

let tokenRefreshInvoker: RefreshInvoker | null = null;

export function setTokenRefreshInvoker(fn: RefreshInvoker | null): void {
  tokenRefreshInvoker = fn;
}

/** Notifies the session owner to re-read localStorage into React state. */
let sessionSyncListener: (() => void) | null = null;

export function setSessionSyncListener(fn: (() => void) | null): void {
  sessionSyncListener = fn;
}

/**
 * Notifies the organization owner that the active organization context was
 * dropped server-side (403 contract) so its React state clears and the
 * user is prompted to pick an organization again.
 */
let organizationResetListener: (() => void) | null = null;

export function setOrganizationResetListener(fn: (() => void) | null): void {
  organizationResetListener = fn;
}

/** Exact backend messages from OrganizationContextService.resolve().
 *  Both indicate the active organization context is no longer usable:
 *   - the organization is missing or deactivated, or
 *   - the caller's membership was revoked (403 'Not a member...'). */
const ORGANIZATION_CONTEXT_LOST_MESSAGES = [
  'The requested organization is not available',
  'Not a member of the requested organization',
];

function isOrganizationContextLost(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const message = (body as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    ORGANIZATION_CONTEXT_LOST_MESSAGES.includes(message)
  );
}

/**
 * /auth/* calls manage tokens themselves: refreshing on their own 401s
 * would recurse (refresh endpoint) or misfire (login bad-credentials).
 */
function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/auth/');
}

/**
 * SINGLE-FLIGHT refresh shared by all concurrent 401s.
 *
 * This is a correctness requirement, not an optimization: the backend
 * rotates the refresh token on every use and revokes ALL of a user's
 * tokens when an already-used refresh token is replayed. Parallel refresh
 * calls would therefore force-logout the user; sharing one promise makes
 * N concurrent 401s cost exactly one refresh round-trip.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!tokenRefreshInvoker) return Promise.resolve(false);
  refreshInFlight ??= tokenRefreshInvoker().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
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
    // 403 context loss: drop the stale organization (module registry
    // immediately; provider React state via the listener) so the user is
    // returned to organization selection. The ApiError is still thrown so
    // callers render their own 403 handling.
    if (response.status === 403 && isOrganizationContextLost(parsed)) {
      activeOrganizationId = null;
      organizationResetListener?.();
    }

    // 401 recovery: one shared refresh + exactly one retry with the fresh
    // token (re-read from localStorage inside the recursive call). Never
    // for /auth/* endpoints; never more than once per request.
    if (
      response.status === 401 &&
      !init.authRetryDone &&
      !isAuthEndpoint(path)
    ) {
      const refreshed = await refreshOnce();
      // The session owner re-reads storage: new tokens after a successful
      // refresh, null (-> AuthGuard redirect) after a failed one.
      sessionSyncListener?.();
      if (refreshed) {
        return apiFetch<TResponse>(path, { ...init, authRetryDone: true });
      }
    }

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
