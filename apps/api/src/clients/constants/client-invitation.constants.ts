/**
 * Client invitation token constants (Client Module V1).
 *
 * Stored hash-only (mirrors EmailVerificationToken); single-use with
 * expiry. The 72-hour window is an implementation choice within the
 * approved plan (invitation TTL was an implementation-level detail).
 */
export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;