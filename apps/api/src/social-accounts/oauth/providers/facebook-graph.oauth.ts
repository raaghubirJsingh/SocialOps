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

  /**
   * Resolve the INSTAGRAM identity, not the Facebook one.
   *
   * A Facebook Login token's `/me` always returns the authorizing **Facebook
   * user** - a Facebook person is not an Instagram account. SocialOps documents
   * `SocialAccount.platformAccountId` for INSTAGRAM as the "IG user id"
   * (prisma/schema.prisma), so inheriting `fetchProfile` from the base class
   * persisted a Facebook user id under an Instagram row: wrong identity, and
   * one that would collide with the Facebook row for the same person.
   *
   * The Instagram Graph API reaches the account through the Page the person
   * manages: `GET /me/accounts` lists those Pages, and each Page carries its
   * linked `instagram_business_account`. That sub-object's `id` IS the Instagram
   * account id and `username` is its handle.
   *
   * Scopes are unchanged - `instagram_basic` covers the linked IG account,
   * `pages_show_list` covers the Pages list, `pages_read_engagement` covers the
   * Page fields. No new permission or architectural decision is introduced.
   *
   * A person may manage several Pages (only some linked to Instagram) or none
   * at all, so the list is scanned and an unresolvable account fails CLOSED
   * with a typed error rather than silently recording the wrong identity. This
   * surfaces as the existing `oauth_exchange_failed` callback marker - no
   * partial write ever happens, because the failure precedes the transaction.
   */
  override async fetchProfile(accessToken: string): Promise<OAuthProfile> {
    const params = new URLSearchParams({
      fields: 'instagram_business_account{id,username}',
      access_token: accessToken,
    });
    const json = await fetchJsonOrThrow(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${params}`,
    );

    const pages = json['data'];
    if (!Array.isArray(pages)) {
      throw new Error('Instagram profile response is missing the pages list');
    }

    for (const raw of pages) {
      const linked = (raw as Record<string, unknown>)[
        'instagram_business_account'
      ] as Record<string, unknown> | undefined;
      const id = linked?.['id'];
      // Provider-derived and authoritative: never a client-supplied value.
      if (typeof id === 'string' && id.length > 0) {
        const username = linked?.['username'];
        return {
          platformAccountId: id,
          displayName:
            typeof username === 'string' && username.length > 0
              ? username
              : undefined,
        };
      }
    }

    throw new Error(
      'No linked Instagram Professional/Business account was found on any managed Page',
    );
  }
}