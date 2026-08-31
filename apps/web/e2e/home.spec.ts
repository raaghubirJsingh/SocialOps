import { test, expect } from '@playwright/test';

/**
 * Smoke coverage for the frontend foundation.
 *
 * The application entry route is `/`. When unauthenticated, the
 * client-side session guard navigates to `/login`. The login
 * page is the only stable public surface in the foundation
 * (subsequent pages are gated by an authenticated session and
 * would require backend fixtures the foundation intentionally
 * avoids creating).
 *
 * Two cases are covered:
 *   1. The login form renders with the email + password fields.
 *   2. Submitting the empty form surfaces client-side validation
 *      errors before any network call.
 */

test('login page renders the email and password fields', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'navigation response').not.toBeNull();
  expect(response!.status(), 'HTTP status').toBe(200);

  await expect(
    page.getByRole('heading', { name: 'Welcome back', level: 3 }),
  ).toBeVisible();

  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /sign in/i }),
  ).toBeEnabled();
});

test('empty submit shows validation errors', async ({ page }) => {
  await page.goto('/');

  const submit = page.getByRole('button', { name: /sign in/i });
  await submit.click();

  await expect(
    page.getByText('Email is required', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Password is required', { exact: true }),
  ).toBeVisible();
});
