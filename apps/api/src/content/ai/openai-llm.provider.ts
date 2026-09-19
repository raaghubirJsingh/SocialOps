import { LlmError } from './llm.errors.js';
import { postJson } from './llm-http.js';
import { buildSystemPrompt, buildUserPrompt, draftTitle } from './llm-prompt.js';
import type { LlmGenerateParams, LlmProvider, LlmResult } from './llm.types.js';

export interface OpenAiLlmConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * OpenAI Chat Completions provider over the raw HTTPS API using Node's global
 * `fetch`. No OpenAI SDK dependency is introduced (AGENTS.md §3/§14).
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai' as const;

  constructor(private readonly config: OpenAiLlmConfig) {}

  async generate(params: LlmGenerateParams): Promise<LlmResult> {
    const data = (await postJson({
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { authorization: `Bearer ${this.config.apiKey}` },
      body: {
        model: this.config.model ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSystemPrompt(params) },
          { role: 'user', content: buildUserPrompt(params) },
        ],
        ...(this.config.maxTokens
          ? { max_completion_tokens: this.config.maxTokens }
          : {}),
      },
      timeoutMs: this.config.timeoutMs ?? 30_000,
    })) as OpenAiCompletion;

    const body = data.choices?.[0]?.message?.content?.trim();
    if (!body) {
      throw new LlmError('empty', 'OpenAI returned an empty completion');
    }

    return {
      title: draftTitle(params.skillSpecialization, params.contentTitle),
      body,
    };
  }
}
