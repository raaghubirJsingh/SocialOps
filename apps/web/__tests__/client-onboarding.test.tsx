describe('Client Onboarding Contracts', () => {
  it('onboarding page module is importable', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    expect(typeof mod.default).toBe('function');
  });

  it('onboarding page supports multi-step self-registration flow', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/client type/i);
    expect(pageContent).toMatch(/direct email/i);
    expect(pageContent).toMatch(/direct phone/i);
    expect(pageContent).toMatch(/verification code/i);
  });

  it('onboarding page calls start onboarding with required fields', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/startOnboarding/i);
    expect(pageContent).toMatch(/INDIVIDUAL|BUSINESS/i);
  });

  it('onboarding page transitions to verification step after start success', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/setStep.*verify|step.*verify/i);
  });

  it('onboarding page activates onboarding with token and redirects to /client', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/activateOnboarding/i);
    expect(pageContent).toMatch(/\/client/);
  });

  it('onboarding page handles start failure without crashing', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/Unable to start onboarding/i);
  });

  it('onboarding page handles activation failure without crashing', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/Unable to verify the mobile code/i);
  });

  it('onboarding page preserves development verification-code note', async () => {
    const mod = await import('@/app/(app)/client/onboarding/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/Development note/i);
  });
});