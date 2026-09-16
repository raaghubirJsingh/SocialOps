/**
 * Social Account types (Client Operations V1).
 *
 * MIRRORS the backend SELECT allowlist in
 * apps/api/src/social-accounts/social-accounts.service.ts (SOCIAL_ACCOUNT_SELECT)
 * and the approved metadata-only schema (docs/APPROVED_DECISIONS.md Decision
 * 008).
 *
 * There is deliberately NO token, ciphertext, secret, or password field in any
 * type in this file: the backend stores and returns non-secret metadata only,
 * OAuth/token storage is deferred, and the UI must never imply that a social
 * account is "connected". A future credential phase must add a SEPARATE table
 * and type rather than widening these shapes.
 */

/**
 * Approved V1 platforms only (AGENTS.md section 2: Instagram, Facebook,
 * YouTube). X and WhatsApp are out of scope; do NOT add values here - the
 * backend rejects anything outside its own list with a 400.
 */
export const SOCIAL_PLATFORMS = Object.freeze([
  'INSTAGRAM',
  'FACEBOOK',
  'YOUTUBE',
] as const);

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Presentation labels only. */
export const SOCIAL_PLATFORM_LABELS: Readonly<Record<SocialPlatform, string>> =
  Object.freeze({
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    YOUTUBE: 'YouTube',
  });

/** A social account as returned by the API (metadata only). */
export interface SocialAccountDto {
  id: string;
  clientId: string;
  platform: SocialPlatform;
  platformAccountId: string | null;
  handle: string | null;
  displayName: string | null;
  profileUrl: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creation payload. Metadata only - the backend `.strict()` schema rejects any
 * credential-shaped key with a 400.
 */
export interface CreateSocialAccountRequest {
  platform: SocialPlatform;
  platformAccountId?: string | null;
  handle?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
  isActive?: boolean;
}

/** Update payload: `platform` is immutable after creation (approved D10). */
export interface UpdateSocialAccountRequest {
  platformAccountId?: string | null;
  handle?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
  isActive?: boolean;
}