import { z } from 'zod';

/** Setting keys that the SuperAdmin UI is allowed to manage. */
export const SETTING_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_MAX_TOKENS',
  'LLM_TIMEOUT_MS',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Single setting upsert payload. */
export const upsertSettingSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.string().min(1),
  description: z.string().optional(),
});

export type UpsertSettingDto = z.infer<typeof upsertSettingSchema>;

/** Settings list query. */
export const settingsListQuerySchema = z.object({});

export type SettingsListQueryDto = z.infer<typeof settingsListQuerySchema>;