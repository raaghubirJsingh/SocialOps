/**
 * Accept Invitation Contracts.
 *
 * The default export only wraps the real page in a Suspense boundary, so
 * contract assertions run against EVERY exported function of the module
 * (the page + the rendering content component) combined.
 */
async function pageModuleSources(): Promise<string> {
  const mod = await import('@/app/(public)/accept-invitation/page');
  return Object.values(mod)
    .filter((value) => typeof value === 'function')
    .map((fn) => (fn as (...args: unknown[]) => unknown).toString())
    .join('\n');
}

describe('Accept Invitation Contracts', () => {
  it('accept invitation page module is importable', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    expect(typeof mod.default).toBe('function');
  });

  it('page handles public invitation resolution', async () => {
    const pageContent = await pageModuleSources();
    expect(pageContent).toMatch(/resolveInvitation|invitations?/i);
  });

  it('page shows invitation details (client name, email, expiry)', async () => {
    const pageContent = await pageModuleSources();
    expect(pageContent).toMatch(/clientName|Client Name/i);
    expect(pageContent).toMatch(/email|Email/i);
    expect(pageContent).toMatch(/expiresAt|Expires|Expiry/i);
  });

  it('page requires authentication for acceptance', async () => {
    const pageContent = await pageModuleSources();
    expect(pageContent).toMatch(/login|Login|sign.?in|Sign in/i);
  });

  it('page handles invalid/expired/used invitation', async () => {
    const pageContent = await pageModuleSources();
    expect(pageContent).toMatch(/invalid|expired|has expired/i);
  });
});
