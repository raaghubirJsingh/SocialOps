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
 *   2. Anchor tabs navigate to each section (Features … Contact).
 *   3. The Features section states the enforced rules and the live-vs-next
 *      strip is present (no claim that deferred modules are working).
 *   4. Empty contact-form submit surfaces client-side validation
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
    { tab: 'Features', href: '#features', heading: 'Approvals you can prove' },
    { tab: 'About', href: '#about', heading: 'Operations, not just posting' },
    { tab: 'Platforms', href: '#platforms', heading: 'Built for Instagram, Facebook' },
    { tab: 'Workflow', href: '#workflow', heading: 'Client → Commitment' },
    { tab: 'Standards', href: '#standards', heading: 'Built to be trusted' },
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
    // Section headings are <h2> (SectionHeading); level-scoping keeps this
    // unambiguous where a card title repeats part of the same wording.
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: new RegExp(`^${heading}`, 'i'),
      }),
    ).toBeVisible();
  }
});

test('features section states what is live and what is still deferred', async ({
  page,
}) => {
  await page.goto('/#features');

  // The three enforced rules are present by name.
  await expect(
    page.getByRole('heading', { name: /client-owner final confirmation/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /strict tenant isolation/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /metadata-only security/i }),
  ).toBeVisible();

  // The honesty strip must be present, and publishing must be shown as a
  // FUTURE phase rather than something already working.
  await expect(page.getByText('Live today', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Next approved phases', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: /publishing and scheduling/i }),
  ).toBeVisible();
});

test('standards section replaced fabricated testimonials with capabilities', async ({
  page,
}) => {
  await page.goto('/#standards');

  // Capability titles are card <h3>s; the section heading is the <h2>.
  await expect(
    page.getByRole('heading', { level: 3, name: /approvals you can prove/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: /honest by default/i }),
  ).toBeVisible();

  // No star ratings / named testimonial figures remain on the page.
  await expect(page.getByRole('img', { name: /rated \d out of 5/i })).toHaveCount(
    0,
  );
});

test('empty contact submit shows validation errors', async ({ page }) => {
  await page.goto('/#contact');

  const submit = page.getByRole('button', { name: /send message/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  await expect(page.getByText('Name is required', { exact: true })).toBeVisible();
  await expect(page.getByText('Email is required', { exact: true })).toBeVisible();
});
