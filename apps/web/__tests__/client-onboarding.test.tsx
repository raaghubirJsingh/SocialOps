describe('Client Onboarding Contracts', () => {
  it('onboarding page module is importable', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    expect(typeof mod.default).toBe('function');
  });

  it('onboarding page redirects to /client (centralized flow)', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    // The onboarding page now redirects to /client where the
    // ClientActivationPanel is embedded in the dashboard.
    expect(pageContent).toMatch(/router\.replace.*\/client/);
    expect(pageContent).toMatch(/redirect/i);
  });

  it('onboarding page redirects unauthenticated users to /login', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/router\.replace.*\/login/);
  });

  it('onboarding page shows redirect message while navigating', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/Redirecting to dashboard/i);
  });

  it('onboarding page uses useSession hook for auth state', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/useSession/);
    expect(pageContent).toMatch(/isAuthenticated/);
  });

  it('onboarding page preserves governance documentation', async () => {
    // Governance notes are in the JSDoc comments, so we read the source file directly.
    const fs = await import('fs');
    const path = await import('path');
    const sourcePath = path.join(__dirname, '../app/(app)/client/onboarding/page.tsx');
    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
    expect(sourceContent).toMatch(/Email is verified at sign-up/);
    expect(sourceContent).toMatch(/strictly READ-ONLY/i);
    expect(sourceContent).toMatch(/Phone is REQUIRED/i);
  });
});
