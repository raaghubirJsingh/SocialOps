import { test, expect, type Page } from '@playwright/test';

/**
 * OAuth connection UX — browser-level coverage (apps/web).
 *
 * Two tiers, both runnable WITHOUT a backend and WITHOUT real platform
 * credentials:
 *
 *   1. CALLBACK LISTENER TIER. The listener is mounted in the ROOT layout and
 *      reacts purely to the `?status=` query the backend appends to its 302.
 *      Driving the app straight at those URLs exercises the real component:
 *      the allowlist match, the success/error styling split, the auto-dismiss,
 *      and the URL cleanup.
 *
 *   2. AFFORDANCE TIER. Connect / Reconnect / Disconnect are driven by the
 *      backend-derived `hasCredential` boolean. The reads are stubbed at the
 *      network layer, and the real page is driven through the real
 *      organization picker so the tenant context is established the same way a
 *      user would.
 *
 * NOT covered: a real OAuth handshake. That needs platform client credentials
 * and a registered callback URL, and is out of scope for a deterministic run.
 */

const ORG_ID = '55555555-5555-4555-8555-555555555555';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_NAME = 'Playwright Test Agency';

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** One SocialAccountDto row for the list stubs. */
function account(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    clientId: CLIENT_ID,
    platform: 'INSTAGRAM',
    platformAccountId: null,
    handle: '@socialops',
    displayName: 'SocialOps',
    profileUrl: null,
    isActive: true,
    createdByUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    hasCredential: false,
    ...overrides,
  };
}

/** Minimal ClientDto so the agency client list renders a clickable row. */
function client() {
  return {
    id: CLIENT_ID,
    ownerUserId: null,
    type: 'BUSINESS',
    name: 'Acme Coffee',
    description: null,
    logoUrl: null,
    directEmail: 'hello@acme.test',
    directPhone: '+919876543210',
    primaryContactName: null,
    primaryContactPhone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    industry: null,
    status: 'ACTIVE',
    statusReason: null,
    statusChangedAt: null,
    onboardingStatus: 'ACTIVE',
    onboardingCompletedAt: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test.describe('OAuth callback listener', () => {
  test('shows a success toast for ?status=connected', async ({ page }) => {
    await page.goto('/?status=connected&platform=INSTAGRAM');

    const toast = page.getByRole('status');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Account connected successfully.');
  });

  test('shows an error toast for ?status=oauth_denied', async ({ page }) => {
    await page.goto('/?status=oauth_denied&platform=INSTAGRAM');

    const toast = page.getByRole('status');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('cancelled at the platform');
  });

  test('strips status and platform from the URL after showing the toast', async ({
    page,
  }) => {
    await page.goto('/?status=connected&platform=INSTAGRAM');
    await expect(page.getByRole('status')).toBeVisible();

    // replaceState removes both markers so a refresh does not re-show it.
    await expect
      .poll(() => new URL(page.url()).search, { timeout: 10_000 })
      .toBe('');
  });

  test('ignores an unknown status marker instead of rendering it', async ({
    page,
  }) => {
    // Matched against a fixed allowlist, so a crafted value can never inject
    // arbitrary text into the page.
    await page.goto('/?status=%3Cimg%20src=x%20onerror=alert(1)%3E');
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('shows no toast on a normal visit', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('auto-dismisses the toast', async ({ page }) => {
    await page.goto('/?status=connected');
    await expect(page.getByRole('status')).toBeVisible();

    // AUTO_DISMISS_MS is 8s; allow headroom without making the test slow.
    await expect(page.getByRole('status')).toBeHidden({ timeout: 15_000 });
  });
});

test.describe('connection affordances from hasCredential', () => {
  /**
   * Seed a VALID session, stub the reads, then drive the REAL organization
   * picker.
   *
   * The active organization is deliberately IN-MEMORY only
   * (use-active-organization.tsx: "does not persist the active org across
   * reloads"), so it CANNOT be seeded through localStorage - a `page.goto`
   * would reload and reset it. The flow therefore has to click the org in the
   * picker and then navigate in-app, exactly as a user does.
   */
  async function seedAgency(page: Page, rows: unknown[]) {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'socialops.session',
        JSON.stringify({
          accessToken: 'stub-access-token',
          refreshToken: 'stub-refresh-token',
          user: {
            id: '77777777-7777-4777-8777-777777777777',
            email: 'owner@agency.test',
            fullName: 'Agency Owner',
            accountType: 'SERVICE_PROVIDER',
            isEmployee: false,
          },
        }),
      );
    });

    await page.route('**/api/memberships/me', (route) =>
      route.fulfill(
        json({
          userId: '77777777-7777-4777-8777-777777777777',
          memberships: [
            {
              role: 'OWNER',
              organization: {
                id: ORG_ID,
                name: ORG_NAME,
                slug: 'playwright-agency',
                isActive: true,
              },
            },
          ],
        }),
      ),
    );
    await page.route('**/api/clients*', (route) =>
      route.fulfill(json([client()])),
    );
    // The DETAIL endpoint needs its own stub. Playwright's single '*' does not
    // cross '/', so '**/api/clients*' matches ONLY the list route - a request for
    // /api/clients/{id} escaped to Next.js, 404'd, and the detail page swapped to
    // its error branch, unmounting the section nav mid-click ("element was
    // detached from the DOM"). This glob matches /api/clients/{id} but NOT
    // /api/clients/{id}/social-accounts (its '*' also stops at '/'), so it cannot
    // shadow the stub below.
    await page.route('**/api/clients/*', (route) =>
      route.fulfill(json(client())),
    );
    await page.route('**/api/clients/*/social-accounts*', (route) =>
      route.fulfill(json(rows)),
    );
  }

  /** Land on the agency social-accounts page with a live org context. */
  async function gotoSocialAccounts(page: Page, rows: unknown[]) {
    await seedAgency(page, rows);

    await page.goto('/clients');
    // Choose the organization (sets the in-memory tenant context).
    await page.getByRole('button', { name: new RegExp(ORG_NAME) }).click();

    // Navigate IN-APP so the in-memory org survives: list -> client detail.
    await page
      .getByRole('link', { name: /Acme Coffee/i })
      .first()
      .click();
    // The section nav on the detail page is where social accounts live.
    // Scope to that nav explicitly: an unscoped /social accounts/i ALSO matches
    // the sidebar's Client-scope "Social Accounts" link (sidebar.tsx
    // CLIENT_NAV_ITEMS), which renders before <main>, so `.first()` navigated to
    // the wrong route and detached this element mid-click.
    await page
      .getByRole('navigation', { name: 'Client sections' })
      .getByRole('link', { name: 'Social accounts', exact: true })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Social accounts' }),
    ).toBeVisible();
    // The row itself is proof the list actually rendered. Assert on the
    // HANDLE (the row renders `handle ?? displayName`), which is stable -
    // matching on displayName with exact:true is timing-dependent.
    await expect(page.getByText('@socialops', { exact: true })).toBeVisible();
  }

  test('a connected account shows Reconnect + Disconnect, never Connect', async ({
    page,
  }) => {
    await gotoSocialAccounts(page, [account({ hasCredential: true })]);

    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect', exact: true }),
    ).toHaveCount(0);
  });

  test('an unconnected account shows Connect and hides Disconnect', async ({
    page,
  }) => {
    await gotoSocialAccounts(page, [account({ hasCredential: false })]);

    await expect(
      page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reconnect' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  });

  test('the Connected badge tracks the backend flag', async ({ page }) => {
    await gotoSocialAccounts(page, [account({ hasCredential: true })]);
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  });

  test('never renders credential material', async ({ page }) => {
    // gotoSocialAccounts already asserts the heading AND the account row are
    // on screen, so this test cannot pass vacuously.
    await gotoSocialAccounts(page, [account({ hasCredential: true })]);
    await expect(
      page.getByText(/ciphertext|refresh_token|access_token/i),
    ).toHaveCount(0);
  });

  test('Connect starts the ROW-SCOPED handshake, not the platform-scoped one', async ({
    page,
  }) => {
    // The row id - not the platform - is what must be sent, because the server
    // reads the platform from the row and updates THAT row. Calling the old
    // platform-scoped route here is precisely what produced the duplicate row.
    const requested: string[] = [];
    await page.route(
      '**/api/clients/*/social-accounts/*/connect',
      async (route) => {
        requested.push(new URL(route.request().url()).pathname);
        await route.fulfill(
          json({
            authorizeUrl:
              'https://www.facebook.com/v21.0/dialog/oauth?client_id=stub&state=stub',
            expiresIn: 600,
          }),
        );
      },
    );

    await gotoSocialAccounts(page, [account({ hasCredential: false })]);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    expect(requested).toHaveLength(1);
    // The trailing segment is the SocialAccount id.
    expect(requested[0]).toContain(
      `/${account().id}/connect`,
    );
    // NOT the platform name.
    expect(requested[0]).not.toContain('/INSTAGRAM/connect');
  });

  test('a failed row-scoped start surfaces a message and stays on the page', async ({
    page,
  }) => {
    await page.route('**/api/clients/*/social-accounts/*/connect', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Social account not found' }),
      }),
    );

    await gotoSocialAccounts(page, [account({ hasCredential: false })]);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    // Scoped away from Next's own route announcer, which is also role="alert".
    const alert = page.locator('[role="alert"]').filter({ hasText: /./ }).first();
    await expect(alert).toBeVisible();
    // The raw backend string is NOT shown: describeApiError maps the 404 to a
    // user-facing message that names the scope, without leaking internals.
    await expect(alert).toContainText(/organization or client scope/i);
    await expect(alert).not.toContainText(/stack|node_modules|prisma/i);
    // Still on the page: the failed handshake did not navigate away.
    await expect(
      page.getByRole('heading', { name: 'Social accounts' }),
    ).toBeVisible();
  });

  test('shows no manual platform-id input anywhere on the card', async ({
    page,
  }) => {
    await gotoSocialAccounts(page, [account({ hasCredential: false })]);
    // The platform id is DISCOVERED through OAuth, never typed by hand.
    await expect(
      page.getByLabel(/platform account id|platform id/i),
    ).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: /platform id/i }),
    ).toHaveCount(0);
  });
});

