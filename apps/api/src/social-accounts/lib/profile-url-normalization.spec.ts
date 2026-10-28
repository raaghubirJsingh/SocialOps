import { normalizeProfileUrl, trimProfileUrl } from './profile-url-normalization.js';
import { PROFILE_URL_CASES } from './profile-url-normalization.fixtures.js';

/**
 * Global URL-uniqueness canonicalization (approved decision).
 *
 * The fixtures are the SHARED contract (see the fixtures module): the
 * migration backfill SQL and the SQL-vs-TS parity integration test assert
 * the same expected values, so a divergence between TypeScript and
 * PostgreSQL is a test failure, not a silent duplicate.
 */
describe('normalizeProfileUrl', () => {
  const CASES = PROFILE_URL_CASES;

  it.each(CASES)('normalizes %j to %j', (input, expected) => {
    expect(normalizeProfileUrl(input)).toBe(expected);
  });

  it('treats the documented duplicate pair as ONE key', () => {
    // The observed bug: Instagram and Facebook rows sharing one URL.
    expect(normalizeProfileUrl('https://instagram.com/pahanavastudio')).toBe(
      normalizeProfileUrl('https://www.instagram.com/pahanavastudio/'),
    );
  });

  it('keeps genuinely different profiles distinct', () => {
    const keys = [
      'instagram.com/pahanavastudio',
      'instagram.com/pahanavastudio21',
      'facebook.com/pahanavastudio',
    ].map((u) => normalizeProfileUrl(u));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns null for absent or whitespace-only input (never "")', () => {
    expect(normalizeProfileUrl(null)).toBeNull();
    expect(normalizeProfileUrl(undefined)).toBeNull();
    expect(normalizeProfileUrl('')).toBeNull();
    expect(normalizeProfileUrl('   ')).toBeNull();
    expect(normalizeProfileUrl('\t\n ')).toBeNull();
  });

  it('keeps only the id parameter of a profile.php URL (FIX 1)', () => {
    // Non-`id` parameters are share/tracking noise, never identity.
    expect(normalizeProfileUrl('facebook.com/profile.php?id=1&ref=share')).toBe(
      'facebook.com/profile.php?id=1',
    );
    expect(normalizeProfileUrl('https://www.facebook.com/profile.php?ref=x&id=1#f')).toBe(
      'facebook.com/profile.php?id=1',
    );
    // The id is found wherever it sits in the query.
    expect(normalizeProfileUrl('facebook.com/profile.php?id=1&ref=share&sk=about')).toBe(
      'facebook.com/profile.php?id=1',
    );
  });

  it('keeps profile.php ids DISTINCT after non-id params are dropped', () => {
    // The whole point of keeping `id`: two different people must never
    // collapse into one key just because their share links differ.
    const withNoise = normalizeProfileUrl('facebook.com/profile.php?id=1&ref=share');
    const bare = normalizeProfileUrl('facebook.com/profile.php?id=1');
    const other = normalizeProfileUrl('facebook.com/profile.php?id=2');
    expect(withNoise).toBe(bare);
    expect(other).not.toBe(bare);
    expect(new Set([withNoise, bare, other]).size).toBe(2);
  });

  it('normalizes a profile.php with no id to the bare path', () => {
    expect(normalizeProfileUrl('facebook.com/profile.php')).toBe('facebook.com/profile.php');
    expect(normalizeProfileUrl('https://www.facebook.com/profile.php?ref=share')).toBe(
      'facebook.com/profile.php',
    );
    // An empty id is not an identity either.
    expect(normalizeProfileUrl('facebook.com/profile.php?id=')).toBe('facebook.com/profile.php');
  });

  it('never uses new URL() — non-URL strings must not throw', () => {
    // A bare `?id=1` is not an absolute URL, so URL/URLSearchParams would
    // throw here; the plain-string implementation must survive it.
    expect(() => normalizeProfileUrl('?id=1')).not.toThrow();
    expect(() => normalizeProfileUrl('not a url')).not.toThrow();
  });

  it('leaves a literal-dot host alone: `m.` must not eat medium/meta/mastodon', () => {
    // These fail if the regex dots were ever unescaped: `^(www.|m.|mobile.)`
    // would strip `m` + any char, mangling every one of these hosts.
    expect(normalizeProfileUrl('medium.com/x')).toBe('medium.com/x');
    expect(normalizeProfileUrl('meta.com/x')).toBe('meta.com/x');
    expect(normalizeProfileUrl('mastodon.social/@x')).toBe('mastodon.social/@x');
  });

  it('does NOT take the profile.php branch for a similar-looking path', () => {
    // The `.` in `profile.php` is a literal. `profileXphp` is a different
    // path, so its query is dropped like any other.
    expect(normalizeProfileUrl('facebook.com/profileXphp?id=1')).toBe(
      'facebook.com/profilexphp',
    );
    // ...and it is therefore NOT equal to the real profile.php id form.
    expect(normalizeProfileUrl('facebook.com/profileXphp?id=1')).not.toBe(
      normalizeProfileUrl('facebook.com/profile.php?id=1'),
    );
  });

  it('never rejects input — best-effort canonicalization only (no .url() rule)', () => {
    for (const odd of ['not a url', 'https://', '???', '///']) {
      expect(() => normalizeProfileUrl(odd)).not.toThrow();
    }
  });
});

describe('trimProfileUrl (stored form)', () => {
  it('stores the trimmed value and null for whitespace-only', () => {
    expect(trimProfileUrl('  https://instagram.com/x  ')).toBe(
      'https://instagram.com/x',
    );
    // correction 4: profileUrl must NEVER store "   " while the key is null.
    expect(trimProfileUrl('   ')).toBeNull();
    expect(trimProfileUrl(null)).toBeNull();
    expect(trimProfileUrl('')).toBeNull();
  });
});
