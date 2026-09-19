import type { LlmGenerateParams } from './llm.types.js';

/**
 * Deterministic draft title. This preserves the original bookend convention
 * (`[AI Draft - <skill>] <contentTitle>`) so the title never depends on the
 * LLM's free-form output — only the body is machine-generated.
 */
export function draftTitle(
  skillSpecialization: string | null,
  contentTitle: string,
): string {
  const skill = skillSpecialization ?? 'General AI Assistant';
  return `[AI Draft - ${skill}] ${contentTitle}`;
}

export function buildSystemPrompt(params: LlmGenerateParams): string {
  const skill = params.skillSpecialization ?? 'General AI Assistant';
  const output =
    params.outputType === 'revision'
      ? 'Write a complete, publishable draft. Return only the body text.'
      : 'Write concise internal commentary/analysis. Return only the body text.';
  return [
    'You are a specialized social-media content team member.',
    `Role / specialization: ${skill}.`,
    'Produce high-quality copy. Do not invent facts beyond what is provided.',
    output,
  ].join('\n');
}

export function buildUserPrompt(params: LlmGenerateParams): string {
  return [
    `Current content title: ${params.contentTitle}`,
    `Task: ${params.prompt}`,
  ].join('\n');
}
