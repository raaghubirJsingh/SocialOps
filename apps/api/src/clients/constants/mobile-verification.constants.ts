/**
 * Mobile verification constants (Client Module V1, approved decision D3).
 *
 * Provider-independent: no SMS provider is assumed or configured. V1
 * delivery is the gated local development log only (see the auth module's
 * BOOT_ARTIFACTS gate); no paid service and no production provider.
 */

/** Raw token entropy: 32 random bytes, hex-encoded to 64 characters. */
export const MOBILE_VERIFICATION_TOKEN_BYTES = 32;

/**
 * Token time-to-live. Mirrors the approved email verification window
 * (24 hours); configurable here in exactly one place.
 */
export const MOBILE_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;