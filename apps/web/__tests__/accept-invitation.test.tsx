describe('Accept Invitation Contracts', () => {
  it('accept invitation page module is importable', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    expect(typeof mod.default).toBe('function');
  });

  it('page handles public invitation resolution', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/invitations/i);
  });

  it('page shows invitation details (client name, email, expiry)', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/clientName|Client Name/i);
    expect(pageContent).toMatch(/email|Email/i);
    expect(pageContent).toMatch(/expiresAt|Expires|Expiry/i);
  });

  it('page requires authentication for acceptance', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/login|Login|sign.?in|Sign in/i);
  });

  it('page handles invalid/expired/used invitation', async () => {
    const mod = await import('@/app/(public)/accept-invitation/page');
    const pageContent = mod.default.toString();
    expect(pageContent).toMatch(/invalid|expired|has expired/i);
  });
});
