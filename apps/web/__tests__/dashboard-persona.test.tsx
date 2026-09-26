/**
 * Dashboard + navigation persona contracts.
 *
 * Covers the persona-aware navigation arrays (sidebar) and the client
 * session binding helper introduced with the persona-aware dashboard:
 *   - agency (SERVICE_PROVIDER): keeps the /clients list;
 *   - client (CLIENT - "Business / Personal Account"): own /client/* links, no agency list;
 *   - employee (isEmployee): dashboard only (AGENTS.md §17.4);
 *   - bound clientId persistence is a UX hint only, never auth state.
 */
import {
  AGENCY_NAV_ITEMS,
  CLIENT_NAV_ITEMS,
  EMPLOYEE_NAV_ITEMS,
} from '@/components/layout/sidebar';
import {
  clearBoundClientId,
  loadBoundClientId,
  saveBoundClientId,
} from '@/lib/client-session';

/** Minimal localStorage stub for the node test environment. */
class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('client-session (bound clientId persistence)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns null when nothing is persisted', () => {
    expect(loadBoundClientId()).toBeNull();
  });

  it('round-trips a persisted binding id', () => {
    saveBoundClientId('11111111-1111-4111-8111-111111111111');
    expect(loadBoundClientId()).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('clear removes the persisted binding', () => {
    saveBoundClientId('11111111-1111-4111-8111-111111111111');
    clearBoundClientId();
    expect(loadBoundClientId()).toBeNull();
  });

  it('ignores empty and oversized values', () => {
    saveBoundClientId('   ');
    expect(loadBoundClientId()).toBeNull();
    saveBoundClientId('x'.repeat(65));
    expect(loadBoundClientId()).toBeNull();
  });
});

describe('persona navigation contracts', () => {
  it('agency persona keeps the /clients list', () => {
    expect(AGENCY_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/clients',
    ]);
  });

  it('client persona gets its own workspace links, not the agency list', () => {
    const hrefs = CLIENT_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual([
      '/dashboard',
      '/client/profile',
      '/client/social-accounts',
      '/client/content',
      '/client/notifications',
    ]);
    expect(hrefs).not.toContain('/clients');
    // Human decision: a self-registered client has NO agency-discovery
    // surface — the navigation must not expose one.
    expect(hrefs).not.toContain('/client/discovery');
    expect(hrefs).not.toContain('/client/agency');
  });

  it('client overview is composed of real data only', async () => {
    const mod = await import('@/components/dashboard/client/client-overview');
    const src = mod.ClientOverview.toString();
    expect(src).toMatch(/useMyClient/);
    expect(src).toMatch(/useContentList/);
    expect(src).toMatch(/useMyHistory/);
    // Governance wording guard: the overview itself never claims a
    // platform "Connection" (OAuth/token storage is deferred).
    expect(src).not.toMatch(/Connected/);
  });

  it('social accounts card records platforms, never connects them', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-social-accounts-card'
    );
    const src = mod.ClientSocialAccountsCard.toString();
    expect(src).toMatch(/Recorded/);
    expect(src).toMatch(/client\/social-accounts/);
    expect(src).not.toMatch(/Connected/);
  });

  it('notifications page renders the real audit trail', async () => {
    const mod = await import('@/app/(app)/client/notifications/page');
    const src = mod.default.toString();
    expect(src).toMatch(/useMyHistory/);
    expect(src).toMatch(/No fabricated alerts/);
  });

  it('employee persona exposes only the dashboard (AGENTS.md §17.4)', () => {
    expect(EMPLOYEE_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
    ]);
  });
});

describe('dashboard persona contracts', () => {
  it('dashboard page module is importable', async () => {
    const mod = await import('@/app/(app)/dashboard/page');
    expect(typeof mod.default).toBe('function');
  });

  it('dashboard renders all three personas with client-first shortcuts', async () => {
    const mod = await import('@/app/(app)/dashboard/page');
    const src = mod.default.toString();
    expect(src).toMatch(/isEmployee/);
    expect(src).toMatch(/CLIENT/);
    expect(src).toMatch(/ClientPersonaSurface/);
    expect(src).toMatch(/ClientActivationPanel/);
    expect(src).toMatch(/ApiStatusCard/);
  });

  it('api status card keeps a manual retry affordance', async () => {
    const mod = await import('@/components/dashboard/api-status-card');
    const src = mod.ApiStatusCard.toString();
    expect(src).toMatch(/refetch/);
    expect(src).toMatch(/Retry/);
  });
});