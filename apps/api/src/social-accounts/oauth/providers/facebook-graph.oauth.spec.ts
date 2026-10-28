import 'reflect-metadata';

import { jest } from '@jest/globals';

import {
  FacebookOAuthProvider,
  InstagramOAuthProvider,
} from './facebook-graph.oauth.js';

/**
 * Identity-resolution contract for the Meta providers.
 *
 * The defect these pin: `InstagramOAuthProvider` used to INHERIT `fetchProfile`
 * from the Facebook base class, which calls `/me`. A Facebook Login token's
 * `/me` always resolves the authorizing **Facebook user**, so an Instagram row
 * was persisted with a Facebook user id - contradicting the documented
 * "IG user id" contract for `SocialAccount.platformAccountId`, and colliding
 * with the Facebook row for the same person.
 *
 * Covered:
 *   - Instagram resolves the linked `instagram_business_account.id` through the
 *     managed Page, and never a Facebook id;
 *   - Facebook behaviour is byte-for-byte unchanged;
 *   - scopes are unchanged (no new permission is requested);
 *   - an unresolvable account fails CLOSED instead of recording a wrong id.
 *
 * No live Meta call is made: `fetch` is stubbed, so no credential, network
 * round-trip or external approval is involved. Live Meta verification remains
 * PENDING on real credentials and a Page linked to an IG Professional account.
 */

process.env.INSTAGRAM_CLIENT_ID ??= 'test-instagram-client-id';
process.env.INSTAGRAM_CLIENT_SECRET ??= 'test-instagram-client-secret';
process.env.FACEBOOK_CLIENT_ID ??= 'test-facebook-client-id';
process.env.FACEBOOK_CLIENT_SECRET ??= 'test-facebook-client-secret';

/** A Graph response the provider accepts. */
function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** Capture every URL `fetch` receives, and serve one canned Graph response. */
function stubFetch(body: unknown) {
  const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okJson(body));
  return {
    spy,
    urls: () => spy.mock.calls.map((c) => String(c[0])),
    restore: () => spy.mockRestore(),
  };
}

describe('InstagramOAuthProvider.fetchProfile - Instagram identity resolution', () => {
  it('returns the linked Instagram business account id, not the Facebook user id', async () => {
    const f = stubFetch({
      data: [
        {
          id: '111111111111111',
          name: 'Example Page',
          instagram_business_account: { id: '17841400000000000' },
        },
      ],
    });
    try {
      const profile = await new InstagramOAuthProvider().fetchProfile('token');
      // THE contract: an Instagram account id, never a Facebook user id.
      expect(profile.platformAccountId).toBe('17841400000000000');
      expect(profile.platformAccountId).not.toBe('111111111111111');
    } finally {
      f.restore();
    }
  });

  it('uses the Instagram username as the display name', async () => {
    const f = stubFetch({
      data: [
        {
          id: '111111111111111',
          instagram_business_account: {
            id: '17841400000000000',
            username: 'socialops_ig',
          },
        },
      ],
    });
    try {
      const profile = await new InstagramOAuthProvider().fetchProfile('token');
      expect(profile.platformAccountId).toBe('17841400000000000');
      expect(profile.displayName).toBe('socialops_ig');
    } finally {
      f.restore();
    }
  });

  it('queries /me/accounts for the instagram_business_account field', async () => {
    const f = stubFetch({ data: [] });
    try {
      await new InstagramOAuthProvider().fetchProfile('token').catch(() => 0);
      const [url] = f.urls();
      expect(url).toContain('graph.facebook.com/v21.0/me/accounts');
      expect(url).toContain('fields=instagram_business_account');
      // The identity is read server-side from the platform, never from input.
      expect(url).toContain('access_token=token');
      // Deliberately NOT /me - that is the Facebook user identity.
      expect(url).not.toContain('/v21.0/me?');
    } finally {
      f.restore();
    }
  });
  it('skips Pages not linked to Instagram and returns the first linked one', async () => {
    const f = stubFetch({
      data: [
        { id: '900000000000001', instagram_business_account: null },
        { id: '900000000000002' },
        {
          id: '900000000000003',
          instagram_business_account: {
            id: '17841400000000009',
            username: 'second_ig',
          },
        },
        {
          id: '900000000000004',
          instagram_business_account: { id: '17841400000000099' },
        },
      ],
    });
    try {
      const profile = await new InstagramOAuthProvider().fetchProfile('token');
      expect(profile.platformAccountId).toBe('17841400000000009');
      expect(profile.displayName).toBe('second_ig');
    } finally {
      f.restore();
    }
  });

  it('fails CLOSED when no managed Page is linked to Instagram', async () => {
    const f = stubFetch({
      data: [
        { id: '900000000000001', instagram_business_account: null },
        { id: '900000000000002' },
      ],
    });
    try {
      const err = await new InstagramOAuthProvider()
        .fetchProfile('token')
        .catch((e: unknown) => e);
      // Never a Facebook id, and never a silent null - the caller sees an error.
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toMatch(/Instagram/i);
    } finally {
      f.restore();
    }
  });

  it('fails CLOSED when the person manages no Pages at all', async () => {
    const f = stubFetch({ data: [] });
    try {
      const err = await new InstagramOAuthProvider()
        .fetchProfile('token')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toMatch(/Instagram/i);
    } finally {
      f.restore();
    }
  });

  it('fails CLOSED when the pages list is missing from the response', async () => {
    const f = stubFetch({ error: { message: 'unknown', code: 100 } });
    try {
      const err = await new InstagramOAuthProvider()
        .fetchProfile('token')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toMatch(/pages list/i);
    } finally {
      f.restore();
    }
  });

  it('never treats an empty-string account id as valid', async () => {
    const f = stubFetch({
      data: [
        {
          id: '900000000000001',
          instagram_business_account: { id: '', username: 'x' },
        },
      ],
    });
    try {
      const err = await new InstagramOAuthProvider()
        .fetchProfile('token')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
    } finally {
      f.restore();
    }
  });
});

describe('FacebookOAuthProvider.fetchProfile - unchanged Facebook behaviour', () => {
  it('still resolves the Facebook user id from /me', async () => {
    const f = stubFetch({ id: '111111111111111', name: 'Mark Example' });
    try {
      const profile = await new FacebookOAuthProvider().fetchProfile('token');
      // Facebook behaviour is preserved exactly.
      expect(profile.platformAccountId).toBe('111111111111111');
      expect(profile.displayName).toBe('Mark Example');
    } finally {
      f.restore();
    }
  });

  it('still calls /me?fields=id,name', async () => {
    const f = stubFetch({ id: '111111111111111', name: 'Mark Example' });
    try {
      await new FacebookOAuthProvider().fetchProfile('token');
      const [url] = f.urls();
      expect(url).toContain('graph.facebook.com/v21.0/me?');
      // Parse rather than substring-match: URLSearchParams percent-encodes the
      // comma, so `fields=id,name` never appears verbatim in the URL.
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/v21.0/me');
      expect(parsed.searchParams.get('fields')).toBe('id,name');
      expect(parsed.searchParams.get('access_token')).toBe('token');
      // Facebook never walks the Pages edge - that path is Instagram-only.
      expect(url).not.toContain('/me/accounts');
    } finally {
      f.restore();
    }
  });

  it('still fails CLOSED when /me returns no id', async () => {
    const f = stubFetch({ name: 'no id here' });
    try {
      const err = await new FacebookOAuthProvider()
        .fetchProfile('token')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toMatch(/account id/i);
    } finally {
      f.restore();
    }
  });
});
describe('scopes and authorize URL are unchanged (no new permission requested)', () => {
  it('Instagram still requests only instagram_basic + pages scopes', async () => {
    const url = new InstagramOAuthProvider().buildAuthorizeUrl(
      'http://localhost:4000/api/social-accounts/callback/INSTAGRAM',
      'state.signed.payload',
    );
    const scope = new URL(url).searchParams.get('scope') ?? '';
    expect(scope.split(',').sort()).toEqual([
      'instagram_basic',
      'pages_read_engagement',
      'pages_show_list',
    ]);
    // The fix needed no additional permission, so no approval gate was added.
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/api/social-accounts/callback/INSTAGRAM',
    );
  });

  it('Facebook scope is untouched', async () => {
    const url = new FacebookOAuthProvider().buildAuthorizeUrl(
      'http://localhost:4000/api/social-accounts/callback/FACEBOOK',
      'state.signed.payload',
    );
    const scope = new URL(url).searchParams.get('scope') ?? '';
    expect(scope.split(',').sort()).toEqual([
      'pages_read_engagement',
      'pages_show_list',
      'public_profile',
    ]);
    // Instagram-specific permission must never leak onto the Facebook flow.
    expect(scope).not.toContain('instagram_basic');
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
  });

  it('keeps both platforms on the same Graph version', () => {
    const fb = new FacebookOAuthProvider().buildAuthorizeUrl(
      'http://localhost:4000/api/social-accounts/callback/FACEBOOK',
      's',
    );
    const ig = new InstagramOAuthProvider().buildAuthorizeUrl(
      'http://localhost:4000/api/social-accounts/callback/INSTAGRAM',
      's',
    );
    expect(fb).toContain('/v21.0/');
    expect(ig).toContain('/v21.0/');
  });
});