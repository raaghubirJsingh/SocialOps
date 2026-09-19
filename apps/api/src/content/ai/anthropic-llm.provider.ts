import { LlmError } from './llm.errors.js';
import { postJson } from './llm-http.js';
import { buildSystemPrompt, buildUserPrompt, draftTitle } from './llm-prompt.js';
import type { LlmGenerateParams, LlmProvider, LlmResult } from './llm.types.js';

export interface AnthropicLlmConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Anthropic Messages provider over the raw HTTPS API using Node's global
 * `fetch`. No Anthropic SDK dependency is introduced (AGENTS.md §3/§14).
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic' as const;

  constructor(private readonly config: AnthropicLlmConfig) {}

  async generate(params: LlmGenerateParams): Promise<LlmResult> {
    const data = (await postJson({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: this.config.model ?? 'claude-3-5-haiku-latest',
        max_tokens: this.config.maxTokens ?? 1024,
        system: buildSystemPrompt(params),
        messages: [{ role: 'user', content: buildUserPrompt(params) }],
      },
      timeoutMs: this.config.timeoutMs ?? 30_000,
    })) as AnthropicMessage;

    const body = data.content?.[0]?.text?.trim();
    if (!body) {
      throw new LlmError('empty', 'Anthropic returned an empty completion');
    }

    return {
      title: draftTitle(params.skillSpecialization, params.contentTitle),
      body,
    };
  }
}
