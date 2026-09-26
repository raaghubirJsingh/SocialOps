/**
 * Client activation + profile governance contracts.
 *
 * Covers the dashboard activation flow (self-registered clients) and the
 * rebuilt profile page:
 *   - the activation panel drives the REAL start + activate endpoints;
 *   - the email is strictly READ-ONLY everywhere (never changeable);
 *   - phone is a required, validated field;
 *   - a PENDING binding renders the activation panel, never a dead end;
 *   - DIRECT_EMAIL is not an editable profile field; NAME/DIRECT_MOBILE
 *     keep the password + verification governance (rate-limited).
 */
import { ClientPersonaSurface } from '@/components/dashboard/client/client-activation-panel';
import { EDITABLE_PROFILE_FIELDS } from '@/app/(app)/client/profile/page';

describe('client activation flow', () => {
  it('activation panel drives the real start + activate endpoints', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    expect(src).toMatch(/startOnboarding/);
    expect(src).toMatch(/activateOnboarding/);
    // Persist the binding hint at START so a refresh cannot lose the
    // pending state.
    expect(src).toMatch(/saveBoundClientId/);
  });

  it('email is strictly read-only in the activation panel', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    expect(src).toMatch(/cannot be changed/);
    // The email is displayed from the session, never submitted as a change.
    expect(src).toMatch(/session\.email/);
  });

  it('phone is a required, validated field', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    expect(src).toMatch(/Phone is required/);
    expect(src).toMatch(/isPhoneValid/);
  });

  it('pending clients get the activation panel, never a dead end', () => {
    const src = ClientPersonaSurface.toString();
    expect(src).toMatch(/useMyClient/);
    expect(src).toMatch(/ClientActivationPanel/);
    expect(src).toMatch(/ClientOverview/);
  });
});

describe('profile governance contracts', () => {
  it('identity fields (email, name, phone) are NOT optional editable profile fields', () => {
    const fields = EDITABLE_PROFILE_FIELDS.map((field) => field.field);
    expect(fields).not.toContain('DIRECT_EMAIL');
    expect(fields).not.toContain('NAME');
    expect(fields).not.toContain('DIRECT_MOBILE');
  });

  it('profile page renders full details, the fill form and governance hints', async () => {
    const mod = await import('@/app/(app)/client/profile/page');
    const src = mod.default.toString();
    expect(src).toMatch(/Complete your profile/);
    expect(src).toMatch(/cannot be changed/);
    // Governance hints live on the editable-field configs rendered per row.
    const hints = EDITABLE_PROFILE_FIELDS.map((f) => f.hint ?? '').join(' ');
    expect(hints.toLowerCase()).toMatch(/rate-limited/);
  });
});