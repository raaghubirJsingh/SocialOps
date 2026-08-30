import { test, expect } from '@playwright/test';

/**
 * Minimal browser-level smoke test for apps/web (SocialOps Testing Foundation).
 *
 * The dashboard's home page (apps/web/app/page.tsx) renders the
 * SocialOps dashboard mock with an <h1>Dashboard</h1> heading. This
 * test verifies that the production Next.js server starts, the home
 * page loads successfully, and the dashboard heading is visible. It
 * deliberately does not exercise any feature beyond entry-page render
 * to keep the foundation scoped to AGENTS.md §13.
 */
test('home page loads and renders the dashboard heading', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'navigation response').not.toBeNull();
  expect(response!.status(), 'HTTP status').toBe(200);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
});
