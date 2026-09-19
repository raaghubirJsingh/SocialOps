/**
 * Bound-client persistence helpers (localStorage).
 *
 * Client Module V1: an Individual/Business (self-registered) user owns at
 * most one Client row, bound server-side (Client.ownerUserId). The client
 * pages receive that binding as a `?clientId=` query parameter, which is
 * lost on every reload. This module persists the last server-verified
 * binding id so client-side navigation (sidebar, dashboard shortcuts) can
 * build working links without inventing a new backend route.
 *
 * SECURITY (AGENTS.md §7): the persisted id is a UX lookup hint ONLY. It is
 * a non-secret UUID (it already appears in page URLs) and is NEVER an
 * authorization source — every `/client/me/*` request re-sends it as the
 * `X-Client-Id` header, and the backend re-verifies the User -> Client
 * binding on EVERY request (ClientAccessGuard). A forged or stale id can
 * only ever reach the authenticated caller's own data or a uniform
 * rejection.
 *
 * This module intentionally imports NOTHING (mirrors lib/session-storage.ts
 * so it stays a leaf dependency with no import cycle).
 */

const CLIENT_STORAGE_KEY = 'socialops.clientId';

/** Upper sanity bound; the backend remains the real authority. */
const MAX_ID_LENGTH = 64;

export function loadBoundClientId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 && trimmed.length <= MAX_ID_LENGTH
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

export function saveBoundClientId(clientId: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = clientId.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return;
  window.localStorage.setItem(CLIENT_STORAGE_KEY, trimmed);
}

export function clearBoundClientId(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CLIENT_STORAGE_KEY);
}