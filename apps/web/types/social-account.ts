/**
 * Social Account types (Client Operations V1).
 *
 * MIRRORS the backend SELECT allowlist in
 * apps/api/src/social-accounts/social-accounts.service.ts (SOCIAL_ACCOUNT_SELECT)
 * and the approved metadata-only schema (docs/APPROVED_DECISIONS.md Decision
 * 008).
 *
 * There is deliberately NO token, ciphertext, secret, or password field in any
 * type in this file: the backend stores and returns non-secret metadata only.
 * A social account must never be rendered as "connected" from these shapes -
 * connection state lives on the server and is never exposed here.
 *
 * OAuth CONNECT is a separate concern from this metadata: the connect call
 * returns only a short-lived authorize URL, the browser leaves for the
 * platform, and the backend completes the exchange on its public callback.
 * No credential ever reaches the browser (Decision 013).
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
  /**
   * Derived by the backend: whether a 1:1 credential row exists for this
   * account. Exposes THAT a connection exists, never any part of it - no
   * ciphertext, scope, expiry, or key version reaches the client. Drives
   * Connect vs Reconnect vs Disconnect in the UI.
   */
  hasCredential: boolean;
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

/**
 * Result of starting an OAuth connect handshake.
 *
 * This is a NAVIGATION payload, not a credential: the browser must perform a
 * FULL-PAGE redirect to `authorizeUrl` (an OAuth authorization code cannot be
 * obtained by a background fetch). No token is present or ever returned here -
 * the backend exchanges the code server-side on its public callback.
 */
export interface OAuthConnectResponse {
  authorizeUrl: string;
  expiresIn: number;
}

/**
 * Status markers the backend appends to the redirect query when it sends the
 * browser back to the frontend (see `oauth-callback.controller.ts`). These
 * are deliberately coarse: the browser must never learn WHY a handshake
 * failed beyond the standard buckets.
 */
/**
 * Status markers the backend appends to the redirect query when it sends the
 * browser back to the frontend (see `oauth-callback.controller.ts`). The VALUE
 * is the exact wire marker; the key is a readable alias for the copy table
 * below. These are deliberately coarse: the browser must never learn WHY a
 * handshake failed beyond the standard buckets.
 */
export const OAUTH_CALLBACK_STATUS = Object.freeze({
  connected: 'connected',
  denied: 'oauth_denied',
  invalidState: 'oauth_state_invalid',
  forbidden: 'oauth_forbidden',
  exchangeFailed: 'oauth_exchange_failed',
} as const);

export type OAuthCallbackStatus =
  (typeof OAUTH_CALLBACK_STATUS)[keyof typeof OAUTH_CALLBACK_STATUS];

/** Human-readable copy for each callback marker, keyed by the wire marker. */
export const OAUTH_CALLBACK_MESSAGES: Readonly<
  Record<OAuthCallbackStatus, string>
> = Object.freeze({
  [OAUTH_CALLBACK_STATUS.connected]:
    'Account connected successfully.',
  [OAUTH_CALLBACK_STATUS.denied]:
    'Connection was cancelled at the platform. Nothing was changed.',
  [OAUTH_CALLBACK_STATUS.invalidState]:
    'That connection link could not be verified. Please start the connection again.',
  [OAUTH_CALLBACK_STATUS.forbidden]:
    'You are not allowed to manage accounts for this client right now.',
  [OAUTH_CALLBACK_STATUS.exchangeFailed]:
    'The platform could not complete the connection. Please try again shortly.',
});

/**
 * Narrowing guard: is this query marker a status we know how to render?
 * Matched against the VALUES, because the raw `?status=` the backend sends is
 * the wire marker (e.g. `oauth_denied`), not our alias key.
 */
export function isOAuthCallbackStatus(
  value: string | null,
): value is OAuthCallbackStatus {
  if (value === null) return false;
  return (
    Object.values(OAUTH_CALLBACK_STATUS) as string[]).includes(value);
}