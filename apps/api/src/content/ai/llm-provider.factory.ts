import { AnthropicLlmProvider } from './anthropic-llm.provider.js';
import { MockLlmProvider } from './mock-llm.provider.js';
import { OpenAiLlmProvider } from './openai-llm.provider.js';
import type { LlmProvider } from './llm.types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolve the configured provider from an env-like object (AGENTS.md §8:
 * environment-based configuration, never hard-coded secrets).
 *
 * Falls back to the deterministic mock when no provider is selected, or when
 * the selected provider's API key is missing, so local dev and CI keep working
 * without credentials.
 *
 * The input is a plain object so callers can merge DB-backed settings on top
 * of process.env (Decision 022: SuperAdmin-managed global settings).
 */
export function resolveLlmProvider(
  env: Record<string, string | undefined> = process.env,
): LlmProvider {
  const name = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const timeoutMs = positiveInt(env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  if (name === 'openai' && env.OPENAI_API_KEY) {
    return new OpenAiLlmProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.LLM_MODEL || undefined,
      maxTokens: positiveInt(env.LLM_MAX_TOKENS, undefined),
      timeoutMs,
    });
  }

  if (name === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return new AnthropicLlmProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.LLM_MODEL || undefined,
      maxTokens: positiveInt(env.LLM_MAX_TOKENS, undefined),
      timeoutMs,
    });
  }

  return new MockLlmProvider();
}

function positiveInt(
  value: string | undefined,
  fallback: number | undefined,
): number | undefined {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}