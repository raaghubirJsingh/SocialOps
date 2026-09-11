/**
 * JWT payload structure for access tokens.
 *
 * `sub` is the user ID (standard JWT subject claim).
 * `email` is included for convenience to avoid an extra DB lookup
 * in the most common authorization checks.
 * `accountType` is product metadata describing how the registrant
 * intends to use SocialOps (AGENTS.md §17). It is NOT authorization
 * state; roles live on OrganizationMembership and are enforced
 * server-side on every request.
 */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  accountType: string | null;
}

/**
 * JWT payload structure for refresh tokens.
 *
 * Only contains the user ID (`sub`); the actual refresh token value
 * is stored hashed in the database.
 */
export interface JwtRefreshPayload {
  sub: string;
  /**
   * Unique identifier for this specific token instance. Required so that two
   * refresh tokens issued in the same second for the same user still have
   * distinct SHA-256 hashes (otherwise the RefreshToken.tokenHash UNIQUE
   * constraint would reject the second one). `jti` is a standard JWT claim
   * (RFC 7519 §4.1.7).
   */
  jti: string;
}
