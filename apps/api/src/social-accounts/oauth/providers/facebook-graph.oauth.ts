import type {
  OAuthProfile,
  OAuthProvider,
  OAuthTokenExchangeResult,
} from './oauth-provider.interface.js';
import {
  fetchJsonOrThrow,
  requireClientConfig,
} from './oauth-provider.interface.js';

const GRAPH_VERSION = 'v21.0';

/**
 * Facebook Login (OAuth 2.0) adapter for the Facebook Graph API.
 * Instagram (business) reuses this flow with platform-specific scopes.
 */
abstract class FacebookGraphProvider implements OAuthProvider {
  abstract readonly platform: 'FACEBOOK' | 'INSTAGRAM';
  protected abstract readonly scope: string;

  buildAuthorizeUrl(redirectUri: string, state: string): string {
    const { clientId } = requireClientConfig(this.platform);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.scope,
      response_type: 'code',
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenExchangeResult> {
    const { clientId, clientSecret } = requireClientConfig(this.platform);
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const json = await fetchJsonOrThrow(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`,
    );
    const expiresIn = json['expires_in'];
    return {
      accessToken: String(json['access_token'] ?? ''),
      refreshToken: undefined,
      expiresIn: typeof expiresIn === 'number' ? expiresIn : undefined,
      scope: undefined,
    };
  }

  async fetchProfile(accessToken: string): Promise<OAuthProfile> {
    const params = new URLSearchParams({
      fields: 'id,name',
      access_token: accessToken,
    });
    const json = await fetchJsonOrThrow(
      `https://graph.facebook.com/${GRAPH_VERSION}/me?${params}`,
    );
    const id = json['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Platform profile is missing the account id');
    }
    const name = json['name'];
    return {
      platformAccountId: id,
      displayName: typeof name === 'string' ? name : undefined,
    };
  }
}

export class FacebookOAuthProvider extends FacebookGraphProvider {
  readonly platform = 'FACEBOOK' as const;
  // Minimal read-only set: identity + the pages list + basic engagement read.
  protected readonly scope = 'public_profile,pages_show_list,pages_read_engagement';
}

/**
 * Instagram (professional/business accounts) is administered THROUGH
 * Facebook Login (Graph API) - same handshake, platform-specific scopes.
 */
export class InstagramOAuthProvider extends FacebookGraphProvider {
  readonly platform = 'INSTAGRAM' as const;
  protected readonly scope =
    'instagram_basic,pages_show_list,pages_read_engagement';
}