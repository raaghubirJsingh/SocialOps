/**
 * Super Admin step-up session storage.
 *
 * Stores the raw sessionToken from the step-up verification (Decision 020).
 * This is NOT the regular JWT session - it's a separate, short-lived
 * token (15 min, TTL-bound) used exclusively for SUPERADMIN routes.
 */
const SUPER_ADMIN_SESSION_KEY = 'socialops.superAdminSession';

export interface SuperAdminSessionData {
  sessionToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Load the super admin session from localStorage.
 * Returns null if no session, expired, or invalid.
 */
export function loadSuperAdminSession(): SuperAdminSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUPER_ADMIN_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SuperAdminSessionData;
    if (data.expiresAt < Date.now()) {
      clearSuperAdminSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Save the super admin session to localStorage.
 * Call after successful step-up verification.
 */
export function saveSuperAdminSession(sessionToken: string): void {
  if (typeof window === 'undefined') return;
  const data: SuperAdminSessionData = {
    sessionToken,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
  };
  localStorage.setItem(SUPER_ADMIN_SESSION_KEY, JSON.stringify(data));
}

/**
 * Clear the super admin session from localStorage.
 * Call on logout, session expiry, or step-up session consumption.
 */
export function clearSuperAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SUPER_ADMIN_SESSION_KEY);
}

/**
 * Check if a valid super admin session exists.
 */
export function hasValidSuperAdminSession(): boolean {
  return loadSuperAdminSession() !== null;
}