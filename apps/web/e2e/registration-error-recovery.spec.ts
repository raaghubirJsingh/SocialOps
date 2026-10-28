import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Registration failure recovery - the chat must NEVER dead-end.
 *
 * Regression cover for the reported defect: submitting the email step called
 * POST /api/auth/registration/start, the request failed, and the user was left
 * with only "Something went wrong. Please try again." and NO input box, so
 * there was no way to retry.
 *
 * Every case below stubs the API, so no backend, database or Redis is involved
 * (AGENTS.md section 11). The shared invariant asserted for ALL of them:
 *   1. an "Email address" input is still on screen,
 *   2. the submitted email is still in it, so nothing must be retyped,
 *   3. at least one action ("Start again") is available,
 *   4. the old generic line never appears.
 */
const START = '**/api/auth/registration/start';
const GENERIC_LEAK = 'Something went wrong. Please try again.';

async function driveDiscoveryToEmail(page: Page): Promise<void> {
  await page.goto('/register');
  await page.getByRole('button', { name: 'अपने Accounts' }).click();
  await page.getByRole('button', { name: 'मेरे Personal Accounts' }).click();
  await page.getByRole('button', { name: 'आगे बढ़ें' }).click();
  await page.getByLabel('Name').fill('Surtaj');
  await page.getByRole('button', { name: 'अगला (Next)' }).click();
  await page.getByLabel('WhatsApp mobile').fill('9884548787');
  await page.getByRole('button', { name: 'अगला (Next)' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
}

async function submitEmail(page: Page): Promise<void> {
  await page.getByLabel('Email address').fill('surtaj12@test.com');
  // The FINAL identity step's button is "OTP भेजें (Send OTP)", not "Next".
  await page.getByRole('button', { name: 'OTP भेजें (Send OTP)' }).click();
}

/** The invariant every failing-start case must satisfy. */
async function expectNotDeadEnded(page: Page): Promise<void> {
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveValue('surtaj12@test.com');
  await expect(
    page.getByRole('button', { name: 'फिर से शुरू करें (Start again)' }),
  ).toBeVisible();
  await expect(page.getByText(GENERIC_LEAK)).toHaveCount(0);
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * The message is rendered TWICE by design - once in the transcript and once in
 * the inline `identityError` alert next to the input - so every message
 * assertion uses `.first()` to avoid a strict-mode violation.
 */
async function expectMessage(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
  // Rendered exactly TWICE by design: the transcript bubble AND the inline
  // `identityError` alert directly under the input. Asserting the count proves
  // the error is shown next to the field, not only in the chat history.
  await expect(page.getByText(text)).toHaveCount(2);
}

test.describe('registration failure recovery (POST /start stubbed)', () => {
  // Serial on purpose. The auth page carries CSS animations
  // (`bg-auth-gradient-animate`, `transition-all` on the option buttons), so a
  // second worker loading it in parallel intermittently leaves the option
  // button "not stable" and the click times out. Running this file's cases one
  // at a time removes that flake without touching the shared Playwright config.
  test.describe.configure({ mode: 'serial' });
  test('a 400 validation error keeps the email input and offers a retry', async ({
    page,
  }) => {
    await page.route(START, (route: Route) =>
      json(route, 400, {
        statusCode: 400,
        error: 'ValidationError',
        message: 'Request payload failed validation',
        details: [{ path: 'email', message: 'Invalid email format' }],
      }),
    );
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    await expectMessage(page, 'Email address सही नहीं है।');
    await expectNotDeadEnded(page);
  });

  test('a 403 without retryAfterSeconds is a generic lifecycle failure', async ({
    page,
  }) => {
    await page.route(START, (route: Route) => json(route, 403, 'Email already in use'));
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    // The 403-without-retryAfterSeconds contract (registration-error.ts):
    // a bare 403 is a generic lifecycle failure, NOT the email-already-
    // registered line. The backend's own English sentence must never leak.
    await expectMessage(page, 'कुछ जानकारी सही नहीं है');
    await expect(page.getByText('Email already in use')).toHaveCount(0);
    await expect(page.getByText('यह email पहले से registered है')).toHaveCount(0);
    await expectNotDeadEnded(page);
  });

  test('a 500 is a connection problem, never a status code or stack', async ({
    page,
  }) => {
    await page.route(START, (route: Route) =>
      json(route, 500, {
        statusCode: 500,
        message: 'Internal server error',
        stack: 'Error: SECRET-STACK-LEAK',
      }),
    );
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    await expectMessage(page, 'हमें कनेक्शन में समस्या हुई');
    await expect(page.getByText('SECRET-STACK-LEAK')).toHaveCount(0);
    await expect(page.getByText('Internal server error')).toHaveCount(0);
    await expect(page.getByText('500')).toHaveCount(0);
    await expectNotDeadEnded(page);
  });

  test('a 404 at the identity step says "wait or use another email"', async ({
    page,
  }) => {
    await page.route(START, (route: Route) =>
      json(route, 404, 'Registration not found or has expired'),
    );
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    await expectMessage(page, 'पहले से चल रही है या अधूरी रह गई है');
    await expectNotDeadEnded(page);
    // "expired" copy would be wrong here - it is an UNFINISHED registration.
    await expect(page.getByText('समाप्त हो चुका है')).toHaveCount(0);
  });

  test('an aborted network request is a connection problem', async ({ page }) => {
    await page.route(START, (route: Route) => route.abort('failed'));
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    await expectMessage(page, 'हमें कनेक्शन में समस्या हुई');
    await expectNotDeadEnded(page);
  });

  test('a malformed 2xx body is treated like a dead API, not a crash', async ({
    page,
  }) => {
    // The response-shape guard: 201 with no resumeToken must not throw a raw
    // TypeError deeper in the component.
    await page.route(START, (route: Route) =>
      json(route, 201, { status: 'PENDING' }),
    );
    await driveDiscoveryToEmail(page);
    await submitEmail(page);

    await expectMessage(page, 'हमें कनेक्शन में समस्या हुई');
    await expectNotDeadEnded(page);
  });
test('a retry after a failure resends all three identity fields', async ({
    page,
  }) => {
    // Proves the rollback kept name/phone, and that the phone is still sent as
    // RAW digits (server-side normalization is unchanged).
    const payloads: string[] = [];
    await page.route(START, (route: Route) => {
      payloads.push(route.request().postData() ?? '');
      return json(route, 400, {
        statusCode: 400,
        details: [{ path: 'email', message: 'x' }],
      });
    });
    await driveDiscoveryToEmail(page);
    await submitEmail(page);
    await expect(page.getByLabel('Email address')).toBeVisible();

    // Retry the same step.
    await page.getByRole('button', { name: 'OTP भेजें (Send OTP)' }).click();
    await expect(page.getByLabel('Email address')).toBeVisible();

    expect(payloads.length).toBeGreaterThanOrEqual(2);
    const last = JSON.parse(payloads[payloads.length - 1] ?? '{}');
    expect(last.fullName).toBe('Surtaj');
    expect(last.phone).toBe('9884548787');
    expect(last.email).toBe('surtaj12@test.com');
  });
});