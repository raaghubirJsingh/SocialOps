import { createSocialAccountSchema } from './create-social-account.dto.js';
import { updateSocialAccountSchema } from './update-social-account.dto.js';

/**
 * METADATA-ONLY enforcement spec (Client Operations V1).
 *
 * The approved schema stores no credential of any kind (Decision 008), so the
 * creation/update contracts must REJECT token-shaped input rather than
 * silently ignore it. These assertions are the regression guard for that rule.
 */
describe('SocialAccount DTOs are metadata-only', () => {
  const validPayload = {
    platform: 'INSTAGRAM',
    platformAccountId: '17841400000000000',
    handle: '@socialops',
    displayName: 'SocialOps',
    profileUrl: 'https://instagram.com/socialops',
  };

  it('accepts a metadata-only payload', () => {
    const result = createSocialAccountSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts an unknown platformAccountId (nullable, unverified metadata)', () => {
    const result = createSocialAccountSchema.safeParse({
      platform: 'YOUTUBE',
      handle: '@channel',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    'accessToken',
    'refreshToken',
    'accessTokenCiphertext',
    'refreshTokenCiphertext',
    'tokenAlgorithm',
    'tokenKeyVersion',
    'password',
    'oauthCode',
    'oauthState',
    'scopes',
    'grantedScopes',
    'clientSecret',
    'storageRef',
  ])('rejects the credential-shaped key %s', (key) => {
    const result = createSocialAccountSchema.safeParse({
      ...validPayload,
      [key]: 'anything',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-scope platform (X is not a V1 platform)', () => {
    const result = createSocialAccountSchema.safeParse({
      ...validPayload,
      platform: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects platform changes on update (platform is immutable, D10)', () => {
    const result = updateSocialAccountSchema.safeParse({
      platform: 'FACEBOOK',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a partial metadata update', () => {
    const result = updateSocialAccountSchema.safeParse({ handle: '@new' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update payload', () => {
    const result = updateSocialAccountSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects credential keys on update too', () => {
    const result = updateSocialAccountSchema.safeParse({
      handle: '@new',
      accessToken: 'x',
    });
    expect(result.success).toBe(false);
  });
});