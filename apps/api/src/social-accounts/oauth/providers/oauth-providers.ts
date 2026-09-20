import { ServiceUnavailableException } from '@nestjs/common';

import type { SocialPlatformValue } from '../../../social-accounts/constants/social-platforms.js';
import type { OAuthProvider } from './oauth-provider.interface.js';
import { FacebookOAuthProvider, InstagramOAuthProvider } from './facebook-graph.oauth.js';
import { YouTubeOAuthProvider } from './youtube.oauth.js';

/** V1 platform registry (AGENTS.md section 2 - exactly three platforms). */
const PROVIDER_ENTRIES: ReadonlyArray<[SocialPlatformValue, OAuthProvider]> = [
  ['FACEBOOK', new FacebookOAuthProvider()],
  ['INSTAGRAM', new InstagramOAuthProvider()],
  ['YOUTUBE', new YouTubeOAuthProvider()],
];

const PROVIDERS: ReadonlyMap<SocialPlatformValue, OAuthProvider> = new Map(
  PROVIDER_ENTRIES,
);

/** Resolve the adapter for a platform; unconfigured platforms fail closed. */
export function getOAuthProvider(platform: SocialPlatformValue): OAuthProvider {
  const provider = PROVIDERS.get(platform);
  if (!provider) {
    throw new ServiceUnavailableException(
      'This platform is not supported for OAuth connections',
    );
  }
  return provider;
}

/** External API origin the platforms redirect back to. */
export function oauthRedirectUri(platform: SocialPlatformValue): string {
  const base =
    process.env.OAUTH_REDIRECT_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 4000}`;
  return `${base.replace(/\/$/, '')}/api/social-accounts/callback/${platform}`;
}