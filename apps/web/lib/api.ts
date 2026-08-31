import { env } from './env';

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
 * It does NOT do any authentication magic, retry, or caching -
 * those concerns belong to TanStack Query and the auth-client.
 *
 * AGENTS.md §8: no server secrets reach the frontend. This wrapper
 * only sends what the caller passes (e.g. an `Authorization: Bearer
 * <accessToken>` header supplied by the auth client).
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

export async function apiFetch<TResponse>(
  path: string,
  init: ApiFetchInit = {},
): Promise<TResponse> {
  const { body, headers, ...rest } = init;

  // We coerce the headers into a plain `Record<string, string>`
  // because the optional spread widens the type under strict mode.
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...((headers ?? {}) as Record<string, string>),
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
