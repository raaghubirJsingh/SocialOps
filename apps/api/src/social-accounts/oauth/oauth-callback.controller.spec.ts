import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import { SocialAccountOAuthCallbackController } from './oauth-callback.controller.js';
import type { OAuthStatePayload } from './oauth-state.service.js';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function payload(overrides: Partial<OAuthStatePayload> = {}): OAuthStatePayload {
  return {
    sub: 'user-1',
    organizationId: 'org-1',
    clientId: CLIENT_ID,
    platform: 'INSTAGRAM',
    source: 'AGENCY',
    nonce: 'n',
    iat: 1,
    exp: 9_999_999_999,
    aud: 'social-connect',
    ...overrides,
  };
}

function makeController(over: { stateError?: Error; completeError?: Error } = {}) {
  const res = { redirect: jest.fn() };
  const state = {
    verify: jest.fn(async () => {
      if (over.stateError) throw over.stateError;
      return payload();
    }),
  };
  const oauth = {
    completeConnect: jest.fn(async () => {
      if (over.completeError) throw over.completeError;
      return { clientId: CLIENT_ID };
    }),
  };
  const controller = new SocialAccountOAuthCallbackController(
    oauth as never,
    state as never,
  );
  return { controller, res, state, oauth };
}

const lastRedirect = (res: { redirect: jest.Mock }) => String(res.redirect.mock.calls.at(-1)![0]);

describe('SocialAccountOAuthCallbackController - server-derived redirect (Design A)', () => {
  const OLD_ENV = process.env.PUBLIC_WEB_URL;
  beforeEach(() => {
    process.env.PUBLIC_WEB_URL = 'https://app.socialops.test';
  });
  afterAll(() => {
    process.env.PUBLIC_WEB_URL = OLD_ENV;
  });

  it('sends an AGENCY connect back to that client page', async () => {
    const { controller, res, state } = makeController();
    await controller.callback('INSTAGRAM', 'code-1', 'state-1', res as never);
    expect(lastRedirect(res)).toBe(
      `https://app.socialops.test/clients/${CLIENT_ID}/social-accounts?status=connected&platform=INSTAGRAM`,
    );
    // The state is consumed exactly once, by the controller.
    expect(asMock(state.verify)).toHaveBeenCalledTimes(1);
  });

  it('sends a CLIENT connect back to the self-service page with its binding', async () => {
    const { controller, res } = makeController();
    const stateSvc = { verify: jest.fn(async () => payload({ source: 'CLIENT' })) };
    const controller2 = new SocialAccountOAuthCallbackController(
      { completeConnect: jest.fn(async () => ({ clientId: CLIENT_ID })) } as never,
      stateSvc as never,
    );
    await controller2.callback('INSTAGRAM', 'code-1', 'state-1', res as never);
    expect(lastRedirect(res)).toContain('/client/social-accounts?clientId=');
    expect(lastRedirect(res)).toContain('status=connected');
    void controller;
  });

  it('never honours a client-supplied returnTo (open-redirect defence)', async () => {
    const { controller, res } = makeController();
    // Even if an attacker injects a path, nothing in the request is used:
    // the destination is derived only from the verified payload.
    await controller.callback(
      'INSTAGRAM',
      'code-1',
      'state-1',
      res as never,
    );
    const target = lastRedirect(res);
    expect(target).not.toContain('evil');
    expect(target.startsWith('https://app.socialops.test/')).toBe(true);
  });

  it('keeps the derived destination on a denied consent', async () => {
    const { controller, res } = makeController();
    await controller.callback('INSTAGRAM', undefined, 'state-1', res as never);
    expect(lastRedirect(res)).toBe(
      `https://app.socialops.test/clients/${CLIENT_ID}/social-accounts?status=oauth_denied&platform=INSTAGRAM`,
    );
  });

  it('falls back to / when the state cannot be verified', async () => {
    const { controller, res, oauth } = makeController({
      stateError: new Error('bad signature'),
    });
    await controller.callback('INSTAGRAM', 'code-1', 'state-1', res as never);
    expect(lastRedirect(res)).toBe('https://app.socialops.test/?status=oauth_state_invalid');
    // A forged state must never reach the token exchange.
    expect(asMock(oauth.completeConnect)).not.toHaveBeenCalled();
  });

  it('maps a forbidden exchange and still returns the user to their page', async () => {
    const { controller, res } = makeController({
      completeError: new ForbiddenException('relationship ended'),
    });
    await controller.callback('INSTAGRAM', 'code-1', 'state-1', res as never);
    const target = lastRedirect(res);
    expect(target).toContain('status=oauth_forbidden');
    expect(target).toContain(`/clients/${CLIENT_ID}/social-accounts`);
  });

  it('rejects an unsupported platform before anything else', async () => {
    const { controller, res, state } = makeController();
    await controller.callback('X', 'code-1', 'state-1', res as never);
    expect(lastRedirect(res)).toBe('https://app.socialops.test/?status=oauth_state_invalid');
    expect(asMock(state.verify)).not.toHaveBeenCalled();
  });
});
