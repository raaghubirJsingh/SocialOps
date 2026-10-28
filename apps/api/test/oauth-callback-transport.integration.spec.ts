/**
 * OAuth callback transport regression (Decision 013).
 *
 * The callback is a BROWSER-FACING navigation endpoint: every outcome must be
 * an HTTP 302 whose Location points at the configured frontend with a coarse
 * status marker. The browser cannot complete a handshake otherwise.
 *
 * This is an HTTP-level test on purpose: the unit spec mocks the response
 * object, so it cannot catch a transport defect. A live bug returned
 * `200 OK` with a 1-byte body instead of a redirect, and every unit test
 * still passed.
 *
 * No valid OAuth state, token, or secret is ever used or logged here: the
 * only state values are deliberately invalid literals.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { OAuthStateService } from '../src/social-accounts/oauth/oauth-state.service.js';

if (!process.env.JWT_ACCESS_SECRET)
  process.env.JWT_ACCESS_SECRET = 'integration-callback-access-32';
if (!process.env.JWT_REFRESH_SECRET)
  process.env.JWT_REFRESH_SECRET = 'integration-callback-refresh-3';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';
// The state layer refuses to mint or verify without a dedicated secret, so
// the test supplies a test-only value; the invalid states below are rejected
// by signature comparison long before any provider is contacted.
if (!process.env.OAUTH_STATE_SECRET)
  process.env.OAUTH_STATE_SECRET = 'integration-callback-oauth-state-3';
if (!process.env.PUBLIC_WEB_URL)
  process.env.PUBLIC_WEB_URL = 'http://localhost:3000';

const FRONTEND_BASE = (
  process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

let app: INestApplication;
let http: ReturnType<typeof request>;

/** Parse a Location header without ever echoing the URL back in assertions. */
function locationOf(res: request.Response): URL | null {
  const raw = res.headers.location;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return new URL(raw);
}

/**
 * Mint a real CLIENT-persona state directly through the state service.
 *
 * Needed because only a VERIFIED payload produces the query-bearing destination
 * (`/client/social-accounts?clientId=...`) this test is about. It uses the real
 * signing + Redis single-use path; nothing is stubbed or forged.
 */
async function mintClientState(): Promise<string> {
  const states = app.get(OAuthStateService);
  return states.mint({
    sub: 'user-some-owner',
    organizationId: 'org-somewhere',
    clientId: '11111111-1111-4111-8111-111111111111',
    platform: 'INSTAGRAM',
    source: 'CLIENT',
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.init();
  http = request(app.getHttpServer());
}, 30000);

afterAll(async () => {
  await app.close();
});

describe('OAuth callback transport', () => {
  it('answers an invalid state with a 302 to the frontend', async () => {
    const res = await http
      .get('/api/social-accounts/callback/INSTAGRAM')
      .query({ state: 'not-a-signed-state', code: 'irrelevant' })
      .redirects(0);

    // THE regression: this used to be 200 with a 1-byte body.
    expect(res.status).toBe(302);

    const location = locationOf(res);
    expect(location).not.toBeNull();
    expect(location?.origin).toBe(new URL(FRONTEND_BASE).origin);
    expect(location?.searchParams.get('status')).toBe('oauth_state_invalid');
  });

  it('redirects an unsupported platform to the same safe destination', async () => {
    const res = await http
      .get('/api/social-accounts/callback/TWITTER')
      .query({ state: 'not-a-signed-state', code: 'irrelevant' })
      .redirects(0);

    expect(res.status).toBe(302);
    const location = locationOf(res);
    expect(location?.searchParams.get('status')).toBe('oauth_state_invalid');
    // Never a provider-authorization URL for a platform outside V1 scope.
    expect(location?.pathname).not.toContain('oauth');
  });

  it('redirects when the state is missing entirely', async () => {
    const res = await http
      .get('/api/social-accounts/callback/FACEBOOK')
      .redirects(0);

    expect(res.status).toBe(302);
    expect(locationOf(res)?.searchParams.get('status')).toBe(
      'oauth_state_invalid',
    );
  });

  it('leaks no state, token, or secret in the redirect', async () => {
    const secretish = 'not-a-signed-state';
    const res = await http
      .get('/api/social-accounts/callback/INSTAGRAM')
      .query({ state: secretish, code: 'irrelevant' })
      .redirects(0);

    const location = String(res.headers.location ?? '');
    // The submitted state is never reflected back to the browser.
    expect(location).not.toContain(secretish);
    expect(res.text ?? '').not.toContain(secretish);
  });

  it('keeps `status` a real query parameter when the destination already has one', async () => {
    // The CLIENT persona destination is `/client/social-accounts?clientId=...`,
    // which already contains a `?`. A second literal `?` used to be appended,
    // which folded `status` into the clientId value and made the redirect look
    // like it carried no outcome - so the UI could never show "connected".
    //
    // NO `code` is sent, so this stops at the consent-denied branch: the point
    // is the redirect SHAPE, and this keeps the test free of any write.
    const state = await mintClientState();
    const res = await http
      .get('/api/social-accounts/callback/INSTAGRAM')
      .query({ state })
      .redirects(0);

    const location = locationOf(res);
    expect(location).not.toBeNull();
    // `clientId` survived intact and `status` is its own parameter.
    expect(location?.searchParams.get('clientId')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(location?.searchParams.get('status')).toBe('oauth_denied');
  });
});
