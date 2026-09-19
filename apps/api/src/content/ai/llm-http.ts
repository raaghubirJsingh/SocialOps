import { asLlmError, LlmError, llmErrorKindForStatus } from './llm.errors.js';

interface JsonRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}

/**
 * POST JSON to an LLM provider with a hard timeout. Network/abort failures and
 * non-2xx statuses are normalized to an LlmError (never a raw provider body).
 */
export async function postJson(request: JsonRequest): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LlmError(
        llmErrorKindForStatus(response.status),
        `LLM provider returned HTTP ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new LlmError('upstream', 'LLM provider returned an unparseable response');
    }
  } catch (error) {
    throw asLlmError(error);
  } finally {
    clearTimeout(timer);
  }
}
