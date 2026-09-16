import { z } from 'zod';

/**
 * Zod schema for processing an AI task (agency-only).
 *
 * The contentId comes from the URL param. The body names the AI Employee that
 * performs the task, the prompt, and where the mocked output is stored.
 *
 * `aiUserId` is REQUIRED and is never inferred from the caller: the Agency
 * dispatches the task to a specific AI Employee. AIAgentService re-verifies
 * server-side that this User has `isBot = true` AND holds the MEMBER role in
 * the calling Agency's Organization (AGENTS.md section 7).
 */
export const processAiTaskSchema = z
  .object({
    aiUserId: z.string().uuid('aiUserId must be a UUID'),
    prompt: z
      .string()
      .min(1, 'prompt must not be empty')
      .max(5000, 'prompt must be at most 5000 characters'),
    outputType: z.enum(['revision', 'internal-note']),
  })
  .strict();

export type ProcessAiTaskDto = z.infer<typeof processAiTaskSchema>;