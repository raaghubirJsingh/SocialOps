/**
 * Frontend public environment configuration.
 *
 * AGENTS.md §8: the frontend (Next.js app) must never receive
 * server-side secrets. Only the API base URL is exposed to the
 * client, and only via the `NEXT_PUBLIC_` prefix which Next.js
 * inlines at build time.
 *
 * NEVER add a server-only secret (e.g. JWT signing key, database
 * URL) here.
 */

function getApiBaseUrl(): string {
  // Next.js inlines `process.env.NEXT_PUBLIC_*` at build time.
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (raw && raw.length > 0) {
    return raw.replace(/\/+$/, '');
  }
  // Local development default. The API listens on PORT=4000 by
  // default and exposes a global /api prefix (see apps/api/src/main.ts).
  return 'http://localhost:4000/api';
}

export const env = {
  apiBaseUrl: getApiBaseUrl(),
} as const;
