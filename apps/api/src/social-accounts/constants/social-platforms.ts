import { SocialPlatform } from '@prisma/client';

/**
 * V1 social platforms (LOCKED - AGENTS.md section 2: Instagram, Facebook,
 * YouTube only).
 *
 * X (Twitter) and WhatsApp Channels are explicitly out of primary V1 scope and
 * must not be added without explicit human approval. Later API/frontend code
 * imports from this module so the approved platform list exists in exactly one
 * place (the Prisma schema comment for `SocialPlatform` points here).
 *
 * The colocated spec asserts this list matches the Prisma enum exactly, so a
 * schema-level platform addition cannot silently escape the application layer.
 */
export const SOCIAL_PLATFORMS = Object.freeze([
  'INSTAGRAM',
  'FACEBOOK',
  'YOUTUBE',
] as const);

export type SocialPlatformValue = (typeof SOCIAL_PLATFORMS)[number];

/** Human-readable labels (presentation only; never an authorization input). */
export const SOCIAL_PLATFORM_LABELS: Readonly<
  Record<SocialPlatformValue, string>
> = Object.freeze({
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  YOUTUBE: 'YouTube',
});

/** Runtime guard: true only for an approved V1 platform value. */
export function isSocialPlatform(value: unknown): value is SocialPlatformValue {
  return (
    typeof value === 'string' &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

/** Prisma enum values (spec-only helper for drift detection). */
export const PRISMA_SOCIAL_PLATFORM_VALUES: readonly SocialPlatform[] =
  Object.freeze(Object.values(SocialPlatform));