import {
  SOCIAL_PLATFORM_ALLOWED_HOSTS,
  isSocialPlatform,
  type SocialPlatformValue,
} from '../constants/social-platforms.js';

/**
 * Platform-vs-host validation for SocialAccount.profileUrl (approved rule: a
 * social account URL must belong to its platform).
 *
 * This is deliberately best-effort STRING work and NEVER throws. It is the
 * same discipline as lib/profile-url-normalization.ts: the module receives
 * whatever a human typed, so `new URL()`, `URL`/`URLSearchParams` and any
 * other parser are all forbidden - `new URL('not a url')` throws a TypeError,
 * and a validation helper that crashes the request on malformed input is worse
 * than one that simply answers "no".
 *
 * Nothing here fetches, resolves, or verifies ownership of a profile. It only
 * decides whether the HOST of the supplied string belongs to the selected
 * platform, which is a presentation/consistency rule, not an authorization or
 * existence check.
 */

/**
 * Extract the lowercase host from a profile URL using plain string operations.
 *
 * Steps, in order:
 *   1. trim;
 *   2. drop an explicit scheme (`https://`, `http://`, or any `scheme://`);
 *   3. keep only the AUTHORITY - everything before the first `/`, `?` or `#`;
 *   4. drop userinfo - everything up to the LAST `@` (so the userinfo trick
 *      `instagram.com@evil.com` yields `evil.com`, NOT `instagram.com`);
 *   5. drop a port - everything from the last `:` (userinfo is already gone,
 *      so any surviving `:` is a port separator);
 *   6. lowercase.
 *
 * Returns `null` when no host can be determined (empty string, bare `///`,
 * `?query`, ...), which callers treat as "does not match".
 */
export function extractProfileUrlHost(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // 2. drop any explicit scheme. The character class is the RFC 3986 scheme
  //    rule, so an unknown scheme (`ftp://`) is dropped too rather than being
  //    mistaken for the host.
  let value = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

  // 3. authority only: stop at the first path, query or fragment delimiter.
  const stop = value.search(/[/?#]/);
  if (stop !== -1) value = value.slice(0, stop);

  // 4. drop userinfo, up to the LAST '@'.
  const at = value.lastIndexOf('@');
  if (at !== -1) value = value.slice(at + 1);

  // 5. drop the port.
  const colon = value.lastIndexOf(':');
  if (colon !== -1) value = value.slice(0, colon);

  const host = value.toLowerCase();
  return host.length > 0 ? host : null;
}

/**
 * True when `host` is an allowed domain for the platform, or a sub-domain of
 * one. The "." + domain suffix test is what makes `web.facebook.com` and
 * `m.youtube.com` pass while `notfacebook.com` (no dot boundary) and
 * `facebook.com.evil.com` (suffix lands on the attacker's domain) fail.
 */
function hostBelongsTo(host: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/**
 * Does `rawUrl` belong to `platform`?
 *
 * Returns `false` for a null/undefined/host-less URL and for any platform that
 * is not an approved V1 value: an unknown platform can never be "matched", so
 * a new enum value fails closed until its hosts are added to
 * SOCIAL_PLATFORM_ALLOWED_HOSTS.
 */
export function profileUrlMatchesPlatform(
  platform: string,
  rawUrl: string | null | undefined,
): boolean {
  if (!isSocialPlatform(platform)) return false;
  const host = extractProfileUrlHost(rawUrl);
  if (host === null) return false;
  return hostBelongsTo(host, SOCIAL_PLATFORM_ALLOWED_HOSTS[platform as SocialPlatformValue]);
}

/** Allowed domains for a platform (empty for an unknown platform). */
export function allowedHostsForPlatform(
  platform: string,
): readonly string[] {
  if (!isSocialPlatform(platform)) return [];
  return SOCIAL_PLATFORM_ALLOWED_HOSTS[platform as SocialPlatformValue];
}
