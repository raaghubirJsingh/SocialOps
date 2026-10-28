/**
 * OAuth connect response contract (Decision 013).
 *
 * The connect endpoint returns a NAVIGATION payload: `authorizeUrl` must be
 * the PLATFORM's own authorization endpoint with the signed state bound in as
 * the `state` parameter. The browser leaves the app via
 * `window.location.assign(authorizeUrl)`, so whatever the backend returns is
 * exactly where the user ends up.
 *
 * These tests pin the frontend half of that contract - it must send the
 * client binding and must NOT rewrite the URL it was given. The backend half
 * (that the URL really is a provider URL carrying the state) is asserted in
 * apps/api/src/social-accounts/oauth/social-accounts-oauth.service.spec.ts.
 */
import { socialAccountApi } from '@/lib/social-account-api';
import { apiFetch } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiFetch: jest.fn() }));

const PROVIDER_URL =
  'https://www.facebook.com/v21.0/dialog/oauth?client_id=abc&state=state.signed.payload&response_type=code';

const mockedApiFetch = apiFetch as unknown as jest.Mock;

describe('socialAccountApi OAuth connect', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('sends the client binding and returns the provider URL verbatim', async () => {
    mockedApiFetch.mockResolvedValue({ authorizeUrl: PROVIDER_URL, expiresIn: 600 });

    const res = await socialAccountApi.startOAuthConnectMine(
      '11111111-1111-4111-8111-111111111111',
      'INSTAGRAM',
    );

    // Tenant context is the explicit X-Client-Id header; the backend
    // re-verifies it against the User -> Client binding on every request.
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/client/me/social-accounts/INSTAGRAM/connect',
      { headers: { 'X-Client-Id': '11111111-1111-4111-8111-111111111111' } },
    );
    expect(res.authorizeUrl).toBe(PROVIDER_URL);
    expect(res.expiresIn).toBe(600);
  });

  it('passes the backend payload through unchanged (no client-side rewriting)', async () => {
    // The frontend deliberately does NOT transform the URL: the backend is
    // the single place that decides where the browser is sent, so the value
    // is forwarded verbatim. Guaranteeing it is a real provider URL is the
    // backend contract (pinned in the API spec), not something this layer
    // second-guesses.
    const backendUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=y&state=state.signed.payload';
    mockedApiFetch.mockResolvedValue({
      authorizeUrl: backendUrl,
      expiresIn: 600,
    });

    const res = await socialAccountApi.startOAuthConnectMine(
      '11111111-1111-4111-8111-111111111111',
      'YOUTUBE',
    );

    expect(res.authorizeUrl).toBe(backendUrl);
    // A provider URL is always navigable; a bare state never is.
    expect(() => new URL(res.authorizeUrl)).not.toThrow();
  });

  it('routes each V1 platform to its own connect endpoint', async () => {
    mockedApiFetch.mockResolvedValue({ authorizeUrl: PROVIDER_URL, expiresIn: 600 });

    for (const platform of ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] as const) {
      await socialAccountApi.startOAuthConnectMine(
        '11111111-1111-4111-8111-111111111111',
        platform,
      );
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/client/me/social-accounts/${platform}/connect`,
        expect.anything(),
      );
    }
  });
});

/**
 * Row-scoped connect: the card's Connect button targets ONE existing row.
 *
 * The path segment is the SocialAccount id and NOT a platform. That is the whole
 * point: the backend then reads the platform from the row and updates that row
 * with the platformAccountId it discovers, instead of upserting a second row
 * (the composite upsert can never match a row whose platformAccountId is NULL).
 * No platform id is ever typed by the user or sent from the browser.
 */
describe('socialAccountApi row-scoped OAuth connect', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('sends the row id and the client binding, and no platform', async () => {
    mockedApiFetch.mockResolvedValue({
      authorizeUrl: PROVIDER_URL,
      expiresIn: 600,
    });

    await socialAccountApi.startOAuthConnectMineForAccount(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/client/me/social-accounts/33333333-3333-4333-8333-333333333333/connect',
      { headers: { 'X-Client-Id': '11111111-1111-4111-8111-111111111111' } },
    );
    // The platform is never a parameter: the server reads it from the row.
    const [path] = mockedApiFetch.mock.calls[0] as [string];
    expect(path).not.toContain('INSTAGRAM');
    expect(path).not.toContain('FACEBOOK');
    expect(path).not.toContain('YOUTUBE');
  });

  it('sends the row id on the agency path, with no tenant header of its own', async () => {
    mockedApiFetch.mockResolvedValue({
      authorizeUrl: PROVIDER_URL,
      expiresIn: 600,
    });

    await socialAccountApi.startOAuthConnectForAccount(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    );

    // No explicit X-Client-Id: apiFetch attaches the verified X-Organization-Id,
    // and the backend proves the ACTIVE relationship plus row membership.
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/clients/11111111-1111-4111-8111-111111111111/social-accounts/33333333-3333-4333-8333-333333333333/connect',
    );
  });

  it('returns the provider authorize URL verbatim for the row-scoped flow', async () => {
    mockedApiFetch.mockResolvedValue({
      authorizeUrl: PROVIDER_URL,
      expiresIn: 600,
    });

    const res = await socialAccountApi.startOAuthConnectForAccount(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    );

    // Still a navigation payload the browser leaves for verbatim - the redirect
    // cannot be done by a background fetch.
    expect(res.authorizeUrl).toBe(PROVIDER_URL);
    expect(() => new URL(res.authorizeUrl)).not.toThrow();
  });

  it('never exposes a credential field in the connect response', async () => {
    mockedApiFetch.mockResolvedValue({
      authorizeUrl: PROVIDER_URL,
      expiresIn: 600,
    });

    const res = await socialAccountApi.startOAuthConnectForAccount(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    );

    // Tokens are encrypted server-side and must never reach the browser.
    expect(Object.keys(res).sort()).toEqual(['authorizeUrl', 'expiresIn']);
    expect(JSON.stringify(res)).not.toMatch(/token|secret|credential/i);
  });
});
