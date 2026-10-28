import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { jest } from '@jest/globals';

import { AdminStepUpGuard } from './admin-step-up.guard.js';
import type { AdminStepUpService } from '../admin-step-up.service.js';

// Typed mock function kept as a standalone variable so that mockResolvedValue
// and assertions retain the correct return-type information without needing a
// cast at each call site (mirrors the pattern in auth.service.spec.ts).
const mockValidateSession = jest.fn(
  async (_token: string): Promise<{ userId: string } | null> => null,
);

function makeMockService(): AdminStepUpService {
  return {
    validateSession: mockValidateSession,
  } as unknown as AdminStepUpService;
}

function makeContext(
  sessionTokenHeader?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: sessionTokenHeader
          ? { 'x-admin-session-token': sessionTokenHeader }
          : {},
      }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('AdminStepUpGuard', () => {
  let service: AdminStepUpService;
  let guard: AdminStepUpGuard;

  beforeEach(() => {
    mockValidateSession.mockReset();
    mockValidateSession.mockResolvedValue(null);
    service = makeMockService();
    guard = new AdminStepUpGuard(service);
  });

  it('throws ForbiddenException when X-Admin-Session-Token header is missing', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when validateSession returns null (invalid token)', async () => {
    mockValidateSession.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext('expired-token')),
    ).rejects.toThrow(ForbiddenException);

    expect(mockValidateSession).toHaveBeenCalledWith('expired-token');
  });

  it('returns true and attaches userId to request on valid session', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'admin-123' });

    const request: Request & { user?: { sub: string } } = {
      headers: { 'x-admin-session-token': 'valid-token' },
    } as unknown as Request & { user?: { sub: string } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.user).toEqual({ sub: 'admin-123' });
    expect(mockValidateSession).toHaveBeenCalledWith('valid-token');
  });

  it('does NOT call consumeSession (token is TTL-bound, not single-use)', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'admin-456' });

    await guard.canActivate(makeContext('valid-token'));

    // validateSession is the only service method invoked — never consumeSession
    expect(mockValidateSession).toHaveBeenCalledTimes(1);
  });
});
