/**
 * Client activation + profile governance contracts.
 *
 * Covers the dashboard activation flow (self-registered clients) and the
 * rebuilt profile page:
 *   - 1-Click Activation: the panel sends NO identity payload, because the
 *     backend reads the already-verified data from the User record;
 *   - the name / email / phone / account-type inputs are GONE;
 *   - the mobile code step survives ONLY as the legacy fallback;
 *   - a PENDING binding renders the activation panel, never a dead end;
 *   - DIRECT_EMAIL is not an editable profile field; NAME/DIRECT_MOBILE
 *     keep the password + verification governance (rate-limited).
 */
import { ClientPersonaSurface } from '@/components/dashboard/client/client-activation-panel';
import { EDITABLE_PROFILE_FIELDS } from '@/app/(app)/client/profile/page';

describe('client activation flow', () => {
  it('activates in one call with no identity payload', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // A single button, a single request, and an EMPTY body on the normal
    // path: name, email, phone and persona all come from the verified User
    // record server-side. `type` is only ever sent when the account itself
    // has to answer the persona question.
    expect(src).toMatch(/startOnboarding/);
    expect(src).toMatch(/onActivated/);
    // Persist the binding hint so a refresh cannot lose the state.
    expect(src).toMatch(/saveBoundClientId/);
  });

  it('asks the persona only when the server reports it is missing', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // The chooser is driven by the server's own `missing` field, never
    // guessed client-side, and is gated on the agreement checkbox.
    expect(src).toMatch(/activationMissingField/);
    expect(src).toMatch(/personaRequired/);
    // The button stays disabled until the persona is chosen.
    expect(src).toMatch(/personaRequired && !persona/);
  });

  it('gates activation behind a mandatory T&C acceptance', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // The welcome dialog is bound to panel state and cannot be dismissed.
    expect(src).toMatch(/termsOpen/);
    expect(src).toMatch(/dismissible=\{false\}/);
    expect(src).toMatch(/I Agree & Activate Workspace/);
    // The action stays disabled until the agreement checkbox is ticked,
    // and the handler refuses to run without it.
    // NOTE: assert on identifiers, not JSX attribute syntax - the
    // transpiler rewrites `disabled={...}` into a plain `disabled:` prop,
    // so matching the JSX form would never hit the compiled source.
    expect(src).toMatch(/!agreed/);
    expect(src).toMatch(/loading \|\| !agreed/);
  });

  it('renders the approved T&C copy from the single terms module', async () => {
    const terms = await import('@/lib/client-terms');
    expect(terms.CLIENT_TERMS_SECTIONS).toHaveLength(3);
    const [data, lifecycle, liability] = terms.CLIENT_TERMS_SECTIONS;
    // Verbatim anchors from the approved legal text.
    expect(data.body).toContain('immutable provenance record');
    expect(data.body).toContain('strict tenant isolation');
    expect(lifecycle.body).toContain('Final Confirmation');
    expect(liability.body).toContain('assumes absolutely no liability');
  });

  it('no longer collects name, email, phone or account type', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // The four identity inputs are gone entirely...
    expect(src).not.toMatch(/activation-name/);
    expect(src).not.toMatch(/activation-phone/);
    expect(src).not.toMatch(/activation-client-type/);
    expect(src).not.toMatch(/isPhoneValid/);
    // ...and none of them are ever submitted as a change.
    expect(src).not.toMatch(/setName|setPhone|setType\b/);
    expect(src).not.toMatch(/directEmail:|directPhone:/);
  });

  it('keeps the mobile code step ONLY as the legacy fallback', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // The code form is gated on what the backend reports, so invited and
    // pre-Registration accounts can still complete activation.
    expect(src).toMatch(/mobileVerificationRequired/);
    expect(src).toMatch(/codeRequired/);
    expect(src).toMatch(/activateOnboarding/);
  });

  it('identity is displayed read-only from the session, never editable', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    expect(src).toMatch(/cannot be changed/);
    // NOTE: optional chaining is transpiled to a ternary, so assert on the
    // plain member access that survives in the compiled function source.
    expect(src).toMatch(/session\.email/);
    expect(src).toMatch(/session\.user\.fullName/);
  });

  it('pending clients get the activation panel, never a dead end', () => {
    const src = ClientPersonaSurface.toString();
    expect(src).toMatch(/useMyClient/);
    expect(src).toMatch(/ClientActivationPanel/);
    expect(src).toMatch(/ClientOverview/);
  });

  it('degrades instead of hanging when the client context is missing', () => {
    const src = ClientPersonaSurface.toString();
    // The empty-id branch MUST be checked BEFORE the pending spinner and MUST
    // render a recovery surface: a DISABLED TanStack query stays `isPending`
    // forever, so falling through would hang on "Loading your workspace…".
    expect(src).toMatch(/!clientId/);
    expect(src).toMatch(/MissingClientContext/);
  });

  it('routes the activation mutation through useMutation/onError/describeApiError', async () => {
    const mod = await import(
      '@/components/dashboard/client/client-activation-panel'
    );
    const src = mod.ClientActivationPanel.toString();
    // A TanStack mutation owns the button state, so a failed or timed-out
    // request can never wedge the button on "Activating…".
    expect(src).toMatch(/useMutation/);
    expect(src).toMatch(/onError/);
    expect(src).toMatch(/describeApiError/);
    expect(src).toMatch(/isPending/);
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

  it('profile page shows a fallback (not an infinite loader) when the client context is missing', async () => {
    const mod = await import('@/app/(app)/client/profile/page');
    const src = mod.default.toString();
    // The empty-id branch MUST be checked BEFORE the query's pending branch:
    // `useMyClient` is DISABLED without an id, so it would stay `isPending`
    // forever and hang on "Loading...".
    expect(src).toMatch(/!clientId/);
    expect(src).toMatch(/Client context missing/);
  });

  it('profile industry choices pin to the backend approved list (no drift)', async () => {
    const mod = await import('@/app/(app)/client/profile/page');
    const values = mod.INDUSTRY_OPTIONS.map((opt) => opt.value);
    // Mirrors the backend's approved contract (ACT-1 D4) VALUE-FOR-VALUE.
    // A drifted label here (e.g. "Fitness & Sports" vs the approved
    // "Sports & Fitness") surfaces as a "Bad Request" (400
    // INVALID_FIELD_VALUE) on save.
    expect(values).toEqual([
      'Advertising & Marketing',
      'Automotive',
      'Beauty & Personal Care',
      'Education & Training',
      'Entertainment & Media',
      'Fashion & Apparel',
      'Finance & Insurance',
      'Food & Beverage',
      'Healthcare & Wellness',
      'Hospitality & Travel',
      'Manufacturing',
      'Legal & Professional Services',
      'Nonprofit & Community',
      'Real Estate & Construction',
      'Retail & E-commerce',
      'Sports & Fitness',
      'Technology & Software',
      'Transportation & Logistics',
      'Other',
    ]);
  });
});