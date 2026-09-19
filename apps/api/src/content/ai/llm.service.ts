import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

import { LlmError } from './llm.errors.js';
import { resolveLlmProvider } from './llm-provider.factory.js';
import type { LlmGenerateParams, LlmProvider, LlmResult } from './llm.types.js';

/**
 * Nest-facing facade over the provider layer.
 *
 * AIAgentService depends on this concrete class (not the provider interface)
 * so Nest DI and the unit spec can construct it directly. It resolves the
 * concrete provider once at construction from process.env, and owns the
 * mapping of provider failures to 502/503 so the raw providers never import
 * Nest internals.
 */
@Injectable()
export class LlmService {
  private readonly provider: LlmProvider;

  constructor() {
    this.provider = resolveLlmProvider(process.env);
  }

  get providerName(): string {
    return this.provider.name;
  }

  async generate(params: LlmGenerateParams): Promise<LlmResult> {
    try {
      return await this.provider.generate(params);
    } catch (error) {
      if (error instanceof LlmError) {
        throw mapLlmError(error);
      }
      // A non-provider failure is a programming error: let Nest surface a 500
      // so it is visible in logs rather than being silently masked as 502.
      throw error;
    }
  }
}

function mapLlmError(error: LlmError): HttpException {
  if (error.kind === 'timeout' || error.kind === 'rate_limit') {
    return new ServiceUnavailableException('LLM provider temporarily unavailable');
  }
  return new BadGatewayException('LLM provider failed to generate a response');
}
