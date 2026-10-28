/**
 * Shared fixture contract for profileUrl normalization (approved GLOBAL
 * uniqueness decision).
 *
 * One fixture list, consumed by BOTH:
 *   - src/social-accounts/lib/profile-url-normalization.spec.ts (TypeScript);
 *   - test/social-account-url-normalization-parity.integration.spec.ts
 *     (the migration's PostgreSQL backfill pipeline run through
 *      prisma.$queryRaw).
 *
 * If either side drifts, a fixture fails - a duplicate URL can therefore
 * never slip through the gap between what the service stores and what the
 * migration backfilled.
 */
export const PROFILE_URL_CASES: ReadonlyArray<readonly [input: string, expected: string]> =
  [
    // --- equivalence classes (same profile => same key) ---
    ['instagram.com/x', 'instagram.com/x'],
    ['https://instagram.com/x', 'instagram.com/x'],
    ['https://www.instagram.com/x/', 'instagram.com/x'],
    ['http://m.facebook.com/x?utm=1#about', 'facebook.com/x'],
    ['mobile.youtube.com/channel/abc', 'youtube.com/channel/abc'],
    ['  https://www.instagram.com/x/  ', 'instagram.com/x'], // trim, both ends
    ['HTTPS://WWW.Instagram.COM/X', 'instagram.com/x'], // scheme+host+path case

    // --- literal-dot guard: one leading host prefix only, never a prefix
    //    OF A PREFIX (`m.` must not eat `medium.com` / `meta.com` / `mastodon`) ---
    ['medium.com/x', 'medium.com/x'],
    ['meta.com/x', 'meta.com/x'],
    ['mastodon.social/@x', 'mastodon.social/@x'],
    ['m.medium.com/x', 'medium.com/x'], // a REAL `m.` prefix is still stripped
    ['www.meta.com/x', 'meta.com/x'],

    // --- query strings / fragments are noise, EXCEPT profile.php ---
    ['facebook.com/someone?ref=share#frag', 'facebook.com/someone'],
    ['https://www.facebook.com/someone/', 'facebook.com/someone'],
    // profile.php KEEPS its `id` (the id IS the identity); every other
    // parameter and the fragment are dropped:
    ['https://www.facebook.com/profile.php?id=123', 'facebook.com/profile.php?id=123'],
    ['facebook.com/profile.php?id=123#section', 'facebook.com/profile.php?id=123'],
    ['FACEBOOK.COM/Profile.php?ID=123', 'facebook.com/profile.php?id=123'],
    ['facebook.com/profile.php?id=1', 'facebook.com/profile.php?id=1'],
    ['facebook.com/profile.php?id=2', 'facebook.com/profile.php?id=2'],
    // non-`id` parameters are share/tracking noise and never identity:
    ['facebook.com/profile.php?id=1&ref=share', 'facebook.com/profile.php?id=1'],
    ['https://www.facebook.com/profile.php?ref=x&id=1#f', 'facebook.com/profile.php?id=1'],
    ['facebook.com/profile.php?id=1&ref=share&sk=about', 'facebook.com/profile.php?id=1'],
    // a bare profile.php with no id normalizes to the bare path:
    ['facebook.com/profile.php', 'facebook.com/profile.php'],
    ['https://www.facebook.com/profile.php?ref=share', 'facebook.com/profile.php'],
    // ...but the branch is EXACTLY `profile.php`: a dot is a literal, so a
    // similar-looking path must NOT take the id-preserving branch. It gets the
    // ordinary query-dropping treatment instead.
    ['facebook.com/profileXphp?id=1', 'facebook.com/profilexphp'],

    // --- trailing slash / root ---
    ['https://instagram.com/', 'instagram.com'],
    ['instagram.com/pahanavastudio//', 'instagram.com/pahanavastudio'],
  ];

/** Inputs only, for the SQL parity test (it derives expectations itself). */
export const PROFILE_URL_FIXTURE_INPUTS: readonly string[] = PROFILE_URL_CASES.map(
  ([input]) => input,
);
