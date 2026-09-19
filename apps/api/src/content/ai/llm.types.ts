/**
 * Provider-neutral contract for the AI Employee Fleet LLM layer.
 *
 * This is the seam that lets the mock, OpenAI, and Anthropic providers be
 * swapped without touching AIAgentService's authorization, audit-trail, or
 * persistence logic (AGENTS.md §7, §11).
 */

export type LlmOutputType = 'revision' | 'internal-note';

export interface LlmGenerateParams {
  /** The task description supplied by the dispatching Manager. */
  prompt: string;
  /** The AI Employee's declared skill (null → general assistant). */
  skillSpecialization: string | null;
  /** The Content item's current title, provided as context. */
  contentTitle: string;
  /** Whether the result is new content text or internal commentary. */
  outputType: LlmOutputType;
}

export interface LlmResult {
  /** Deterministic draft title (used for revisions only). */
  title: string;
  /** The generated body text. */
  body: string;
}

export interface LlmProvider {
  readonly name: 'mock' | 'openai' | 'anthropic';
  generate(params: LlmGenerateParams): Promise<LlmResult>;
}
