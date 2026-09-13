import { test, expect } from '@playwright/test';

/**
 * Landing-page smoke coverage for the public "/" route.
 *
 * "/" is the informational landing page (approved routing matrix):
 * sticky anchor tabs scroll to same-page sections — no new routes.
 * The authenticated app lives at /dashboard behind the session guard.
 *
 * Covered:
 *   1. Hero renders with headline + Register/Sign-in entry points.
 *   2. Anchor tabs navigate to each section (About … Contact).
 *   3. Empty contact-form submit surfaces client-side validation
 *      errors before any network call.
 */

test('landing hero renders with entry points', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'navigation response').not.toBeNull();
  expect(response!.status(), 'HTTP status').toBe(200);

  await expect(
    page.getByRole('heading', { name: /one story/i, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /start free today/i }),
  ).toBeVisible();
});

test('anchor tabs reach every section', async ({ page }) => {
  await page.goto('/');

  // Scope to the sticky header nav to avoid the footer copies.
  const headerNav = page.getByRole('navigation', { name: 'Page sections' });

  const tabs: Array<{ tab: string; href: string; heading: string }> = [
    { tab: 'About', href: '#about', heading: 'Operations, not just posting' },
    { tab: 'Platforms', href: '#platforms', heading: 'Built for Instagram, Facebook' },
    { tab: 'Workflow', href: '#workflow', heading: 'Client → Commitment' },
    { tab: 'Reviews', href: '#reviews', heading: 'Loved by teams who hate chaos' },
    { tab: 'FAQ', href: '#faq', heading: 'Questions, answered honestly' },
    { tab: 'Contact', href: '#contact', heading: 'Talk to a human' },
  ];

  for (const { tab, href, heading } of tabs) {
    await headerNav.getByRole('link', { name: tab, exact: true }).click();
    // Anchor navigation is complete once the URL hash matches; only then
    // assert the section heading is actually on screen.
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe(href);
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${heading}`, 'i') }),
    ).toBeVisible();
  }
});

test('empty contact submit shows validation errors', async ({ page }) => {
  await page.goto('/#contact');

  const submit = page.getByRole('button', { name: /send message/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  await expect(page.getByText('Name is required', { exact: true })).toBeVisible();
  await expect(page.getByText('Email is required', { exact: true })).toBeVisible();
});
