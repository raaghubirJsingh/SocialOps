/**
 * profileUrl normalization for the approved GLOBAL URL-uniqueness decision
 * (one canonical key per Social Account URL, across all Clients and all
 * Service Providers/Organizations).
 *
 * The rules below are mirrored VERBATIM in TWO other places, and the parity
 * test pins all three to the same fixture list:
 *   1. the backfill expression in
 *      prisma/migrations/<ts>_social_account_global_url_uniqueness/migration.sql;
 *   2. the SQL pipeline in
 *      test/social-account-url-normalization-parity.integration.spec.ts.
 *
 * Rules (in order):
 *   1. trim surrounding whitespace;
 *   2. drop the scheme — an absent scheme and `https://` denote the same
 *      target (`instagram.com/x` == `https://instagram.com/x`);
 *   3. drop one leading `www.` / `m.` / `mobile.` host prefix. The dots are
 *      LITERAL: `^m\.` must never eat `medium.com`, `meta.com` or
 *      `mastodon.social` (see the colocated spec fixtures);
 *   4. drop the fragment (never identifies a profile);
 *   5. drop the query string, EXCEPT when the path is `profile.php`, where the
 *      `id` parameter IS the identity: only `?id=` survives and every other
 *      parameter is discarded (`facebook.com/profile.php?id=123&ref=share`
 *      must collapse to `.../profile.php?id=123`, while `?id=124` stays a
 *      distinct profile, and a bare `profile.php` with no `id` normalizes to
 *      the bare path). Implemented with plain string operations - never
 *      `new URL()`, which would throw on the non-URL strings this
 *      best-effort canonicalizer deliberately accepts;
 *   6. drop trailing slashes;
 *   7. lowercase the ENTIRE result (approved decision — V1 profile paths are
 *      case-insensitive);
 *   8. an empty/whitespace-only value normalizes to `null` (no URL), never `""`.
 *
 * This is deliberately best-effort STRING canonicalization, not URL
 * validation: no input is ever rejected here (the DTO keeps its
 * `.min(1).max(500)` contract and no `.url()` rule is added).
 *
 * The stored `profileUrl` keeps the trimmed user value; this function only
 * produces the comparison key (`normalizedUrl`), which carries the unique
 * index.
 */

/**
 * Trimmed storage form of a profileUrl: `null` when there is nothing to
 * store. Guarantees `profileUrl` is never `"   "` while `normalizedUrl` is
 * NULL (they always agree on "no URL").
 */
export function trimProfileUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reduce a `profile.php` query string to its `id` parameter alone.
 *
 * `new URL()`/`URLSearchParams` are deliberately NOT used: this module accepts
 * best-effort strings such as `not a url` and must never throw, and a bare
 * `?id=1` is not an absolute URL. Plain splitting on `&`, then `=` is enough
 * because a profile URL has no meaningful encoding.
 *
 * Returns the canonical `?id=<value>` suffix, or `null` when the query
 * carries no usable `id` (caller then keeps the bare `profile.php` path).
 */
function profilePhpQuery(query: string): string | null {
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim().toLowerCase();
    if (name !== 'id') continue;
    const value = pair.slice(eq + 1).trim();
    // An empty `?id=` is not an identity - treat it as no id at all.
    if (value.length === 0) continue;
    return `?id=${value}`;
  }
  return null;
}

/** Canonical, globally-unique key for a profileUrl, or `null` when absent. */
export function normalizeProfileUrl(raw: string | null | undefined): string | null {
  const trimmed = trimProfileUrl(raw);
  if (trimmed === null) return null;

  let value = trimmed;
  // 2. normalize scheme (literal dots are not involved here; `s`-style
  //    matching is spelled with [\s\S] so no newline can defeat it).
  value = value.replace(/^https?:\/\//i, '');
  // 3. host prefixes — dots MUST be escaped (correction: `m.` vs `medium.`).
  value = value.replace(/^(www\.|m\.|mobile\.)/i, '');
  // 4. fragment never identifies a profile.
  value = value.replace(/#[\s\S]*$/, '');

  // 5. query strings are noise EXCEPT facebook's profile.php identity, where
  //    only `id` is identity and every other parameter is share/tracking noise.
  const profilePhp = /\/profile\.php(\?[\s\S]*)?$/i.exec(value);
  if (profilePhp) {
    const query = profilePhp[1] ?? '';
    const id = query.length > 1 ? profilePhpQuery(query.slice(1)) : null;
    // Keep the `/profile.php` PATH and rewrite only what followed it: the
    // matched path is always exactly `/profile.php`, so the query (when
    // present) is the only part that may be replaced or dropped.
    value = `${value.slice(0, profilePhp.index)}/profile.php${id ?? ''}`;
  } else {
    value = value.replace(/\?[\s\S]*$/, '');
  }
  // 6. trailing slashes are not identity.
  value = value.replace(/\/+$/, '');
  // 7. lowercase the entire key.
  value = value.toLowerCase();

  return value.length > 0 ? value : null;
}
