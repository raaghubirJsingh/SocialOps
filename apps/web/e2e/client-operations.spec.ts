import { test, expect } from '@playwright/test';

/**
 * Client Operations V1 smoke coverage (apps/web).
 *
 * TWO TIERS, deliberately gated so the default suite stays green without a
 * backend:
 *
 *   1. GUARD TIER (always runs, no API required): every new route is behind the
 *      authenticated `(app)` layout, so an unauthenticated visit must still
 *      return the page and be redirected home by AuthGuard. This proves the
 *      routes are registered and guarded without needing a session.
 *
 *   2. LIVE TIER (skipped unless `E2E_LIVE_API=1` plus client/content ids are
 *      provided): asserts the UI-level policy that Final Confirmation is a
 *      CLIENT-ONLY control - it must be absent on the agency route, and on the
 *      client route it must require an explicit acknowledgement.
 *
 * The structural half of that rule (the agency API client has no confirm call,
 * and the endpoint is referenced only from the client scope) is additionally
 * guarded by the repository check documented in the frontend plan:
 *   git grep -n 'final-confirmation' apps/web
 */

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = '22222222-2222-4222-8222-222222222222';

const GUARDED_ROUTES = [
  '/clients',
  `/clients/${CLIENT_ID}`,
  `/clients/${CLIENT_ID}/social-accounts`,
  `/clients/${CLIENT_ID}/content`,
  `/clients/${CLIENT_ID}/content/${CONTENT_ID}`,
  `/client/content?clientId=${CLIENT_ID}`,
  `/client/social-accounts?clientId=${CLIENT_ID}`,
];

test.describe('client operations routes are guarded', () => {
  for (const route of GUARDED_ROUTES) {
    test(`unauthenticated visit to ${route} is redirected home`, async ({
      page,
    }) => {
      const response = await page.goto(route);
      expect(response, 'navigation response').not.toBeNull();
      // The route is served (it exists)...
      expect(response!.status(), 'HTTP status').toBe(200);

      // ...and AuthGuard sends an unauthenticated visitor to the public home
      // page ("/" - the approved routing matrix, NOT /login).
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
        .toBe('/');
    });
  }
});

const liveEnabled = process.env.E2E_LIVE_API === '1';
const liveClientId = process.env.E2E_CLIENT_ID ?? '';
const liveContentId = process.env.E2E_CONTENT_ID ?? '';

test.describe('client operations live flows', () => {
  test.skip(
    !liveEnabled || !liveClientId || !liveContentId,
    'Gated: start the API, sign in, then run with E2E_LIVE_API=1 E2E_CLIENT_ID=… E2E_CONTENT_ID=…',
  );

  test('agency content detail exposes NO final-confirmation control', async ({
    page,
  }) => {
    await page.goto(`/clients/${liveClientId}/content/${liveContentId}`);

    // The agency surface may offer review transitions, but never the approval.
    await expect(
      page.getByRole('button', { name: /grant final confirmation/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/final confirmation/i)).toHaveCount(0);
  });

  test('client content detail gates final confirmation behind acknowledgement', async ({
    page,
  }) => {
    await page.goto(
      `/client/content/${liveContentId}?clientId=${liveClientId}`,
    );

    const panel = page.getByText('Final confirmation', { exact: true });
    await expect(panel).toBeVisible();

    const confirmButton = page.getByRole('button', {
      name: /grant final confirmation/i,
    });

    // Either the item is not in review (the panel states the precondition) or
    // the control exists and stays disabled until the owner acknowledges.
    if ((await confirmButton.count()) > 0) {
      await expect(confirmButton).toBeDisabled();
      await page.getByRole('checkbox').first().check();
      await expect(confirmButton).toBeEnabled();
    } else {
      await expect(
        page.getByText(/requires the item to be/i),
      ).toBeVisible();
    }
  });
});