import { expect, test } from '@playwright/test';

/**
 * Registration Phase v1.0 - conversational discovery smoke test.
 *
 * Scope: the UI-only discovery conversation (no backend dependency):
 * the approved root question, its three contextual options, the branch
 * question, the confirmation copy, [आगे बढ़ें], and the identity step.
 *
 * The full dual-OTP journey intentionally is NOT covered here: it needs
 * a running API process plus the development console OTP capture
 * (OPEN-4) and is exercised by
 * apps/api/test/registration.integration.spec.ts, which drives the same
 * staged endpoints end-to-end against the real PostgreSQL + Redis.
 */
test.describe('conversational registration discovery', () => {
  test('root question, options, confirmation and identity step render', async ({
    page,
  }) => {
    await page.goto('/register');

    await expect(
      page.getByText('आप SocialOps में किन Accounts को manage करना चाहते हैं?'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'अपने Accounts' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'अपने और दूसरों के Accounts' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'अभी तय नहीं है' })).toBeVisible();

    await page.getByRole('button', { name: 'अपने Accounts' }).click();
    await expect(page.getByText('ये Accounts किसके हैं?')).toBeVisible();

    await page.getByRole('button', { name: 'मेरे Personal Accounts' }).click();
    await expect(page.getByText(/समझ गया/)).toBeVisible();

    await page.getByRole('button', { name: 'आगे बढ़ें' }).click();

    // Identity stage: the fixed text step (never classification first).
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('WhatsApp mobile')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    // No forced Client/Agency/Individual/Business classification control:
    await expect(page.getByText('Individual / Business')).toHaveCount(0);
  });

  test('the undecided path asks a minimum clarification and never guesses', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'अभी तय नहीं है' }).click();
    await expect(
      page.getByText('क्या आप सिर्फ अपने Accounts संभालेंगे, या दूसरों के भी?'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'दूसरों के भी' }).click();
    await expect(page.getByText(/समझ गया/)).toBeVisible();
  });
});
