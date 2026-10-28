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

/**
 * Hosts a profile URL may belong to, per platform (approved rule: a social
 * account URL must belong to its platform - a Facebook account may not carry
 * an instagram.com URL).
 *
 * This map is the SINGLE SOURCE OF TRUTH and deliberately sits next to
 * SOCIAL_PLATFORMS so a platform can never be added without deciding its
 * hosts, and vice versa. Keyed by SocialPlatformValue, so TypeScript itself
 * rejects a key for a platform that does not exist - the compiler is the
 * guard against inventing a platform here.
 *
 * These are the DOMAINS only. Sub-domain matching (web.facebook.com,
 * m.youtube.com) is handled by the matcher in lib/profile-url-platform.ts,
 * which accepts the exact domain or any name ending in "." + domain.
 *
 * Only the three approved V1 platforms appear. Nothing is inferred from a
 * handle, and no host is resolved or fetched - this is a pure string rule.
 */
export const SOCIAL_PLATFORM_ALLOWED_HOSTS: Readonly<
  Record<SocialPlatformValue, readonly string[]>
> = Object.freeze({
  INSTAGRAM: Object.freeze(['instagram.com']),
  FACEBOOK: Object.freeze(['facebook.com', 'fb.com', 'fb.me']),
  YOUTUBE: Object.freeze(['youtube.com', 'youtu.be']),
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