import { ServiceUnavailableException } from '@nestjs/common';

import type { SocialPlatformValue } from '../../../social-accounts/constants/social-platforms.js';

/** Token response normalized across platforms. */
export interface OAuthTokenExchangeResult {
  accessToken: string;
  /** Absent when the platform does not issue refresh tokens. */
  refreshToken?: string;
  /** Seconds until the access token expires, when the platform exposes it. */
  expiresIn?: number;
  /** Granted scope string as returned by the platform. */
  scope?: string;
}

/** Non-secret profile facts used to populate the metadata row. */
export interface OAuthProfile {
  platformAccountId: string;
  handle?: string;
  displayName?: string;
}

/**
 * Per-platform OAuth adapter (V1: Instagram / Facebook / YouTube only,
 * AGENTS.md section 2). Each adapter owns its authorize URL, code exchange
 * and profile fetch. NO token ever leaves the server: exchange results are
 * encrypted by TokenEncryptionService before persistence.
 */
export interface OAuthProvider {
  readonly platform: SocialPlatformValue;
  buildAuthorizeUrl(redirectUri: string, state: string): string;
  exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenExchangeResult>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}

/** Shared HTTP helper: bounded fetch, non-2xx is a failure. */
export async function fetchJsonOrThrow(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Platform request failed with status ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Require a platform client credential pair from the environment. */
export function requireClientConfig(platform: string): {
  clientId: string;
  clientSecret: string;
} {
  const prefix = platform.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    // Fail closed as a SERVICE issue, never as a client error: an unconfigured
    // platform is a deployment fact, not an authorization outcome. The plain
    // Error this replaced surfaced as a generic HTTP 500 with no code, so the
    // UI could only render "Internal server error". The `platform` context is
    // a non-secret platform name from the approved V1 set; the missing
    // variable NAME is named so operators know exactly which env value to set,
    // without exposing any secret value.
    throw new ServiceUnavailableException({
      code: 'OAUTH_PROVIDER_NOT_CONFIGURED',
      message: `${platform} is not connected for OAuth. Please try again later.`,
      platform,
      detail: `OAUTH_PROVIDER_NOT_CONFIGURED: ${prefix}_CLIENT_ID / ${prefix}_CLIENT_SECRET missing.`,
    });
  }
  return { clientId, clientSecret };
}