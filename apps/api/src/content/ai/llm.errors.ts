/**
 * Provider-layer error taxonomy + mapping helpers. Provider failures are
 * normalized here so API responses never leak a provider status body or key
 * (AGENTS.md §8).
 */

export type LlmErrorKind =
  | 'auth' // upstream credential rejection (401/403/407)
  | 'rate_limit' // upstream throttling (429)
  | 'upstream' // any other non-2xx provider response / network failure
  | 'timeout' // request aborted by our timeout
  | 'empty'; // 2xx but no usable text returned

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Map an HTTP status to a provider error kind. */
export function llmErrorKindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403 || status === 407) return 'auth';
  if (status === 429) return 'rate_limit';
  return 'upstream';
}

/**
 * Normalize a thrown value from `fetch` into an LlmError. Our timeout abort
 * becomes `timeout`; already-typed LlmErrors pass through; anything else is
 * treated as an unreachable provider.
 */
export function asLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new LlmError('timeout', 'LLM request timed out');
  }
  return new LlmError('upstream', 'LLM provider unreachable');
}
