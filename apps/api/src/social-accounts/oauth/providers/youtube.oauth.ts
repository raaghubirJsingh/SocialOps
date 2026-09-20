import type {
  OAuthProfile,
  OAuthProvider,
  OAuthTokenExchangeResult,
} from './oauth-provider.interface.js';
import {
  fetchJsonOrThrow,
  requireClientConfig,
} from './oauth-provider.interface.js';

/**
 * Google OAuth 2.0 adapter for YouTube (V1 platform, AGENTS.md section 2).
 * `access_type=offline` + `prompt=consent` obtain a refresh token; the
 * read-only YouTube scope is deliberate - this phase never uploads anything.
 */
export class YouTubeOAuthProvider implements OAuthProvider {
  readonly platform = 'YOUTUBE' as const;

  private readonly authorizeBase = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
  private readonly scope =
    'openid https://www.googleapis.com/auth/youtube.readonly';

  buildAuthorizeUrl(redirectUri: string, state: string): string {
    const { clientId } = requireClientConfig(this.platform);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.scope,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${this.authorizeBase}?${params}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenExchangeResult> {
    const { clientId, clientSecret } = requireClientConfig(this.platform);
    const json = await fetchJsonOrThrow(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const expiresIn = json['expires_in'];
    const refreshToken = json['refresh_token'];
    return {
      accessToken: String(json['access_token'] ?? ''),
      refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
      expiresIn: typeof expiresIn === 'number' ? expiresIn : undefined,
      scope: typeof json['scope'] === 'string' ? json['scope'] : undefined,
    };
  }

  async fetchProfile(accessToken: string): Promise<OAuthProfile> {
    const json = await fetchJsonOrThrow(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const items = json['items'];
    const first = Array.isArray(items) ? items[0] : undefined;
    const channelId = (first as Record<string, unknown> | undefined)?.['id'];
    if (typeof channelId !== 'string' || channelId.length === 0) {
      throw new Error('Platform profile is missing the account id');
    }
    const snippet = (first as Record<string, unknown>)['snippet'] as
      | Record<string, unknown>
      | undefined;
    return {
      platformAccountId: channelId,
      displayName:
        typeof snippet?.['title'] === 'string' ? snippet['title'] : undefined,
    };
  }
}