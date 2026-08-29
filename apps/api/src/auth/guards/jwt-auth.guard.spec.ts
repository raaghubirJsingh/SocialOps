import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const JWT_ACCESS_SECRET = 'test-access-secret-32-chars-minimum';

function makeMockJwt() {
  return {
    verify: vi.fn((token: string) => {
      if (token === 'invalid-token') throw new Error('jwt invalid');
      return { sub: 'user-1', email: 'a@b.com' };
    }),
  } as unknown as JwtService;
}

function makeContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: authHeader } }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockJwt: JwtService;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = JWT_ACCESS_SECRET;
    mockJwt = makeMockJwt();
    guard = new JwtAuthGuard(mockJwt);
  });

  it('throws UnauthorizedException when Authorization header is missing', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when Authorization header is malformed', () => {
    expect(() => guard.canActivate(makeContext('Basic abc'))).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token is invalid', () => {
    expect(() => guard.canActivate(makeContext('Bearer invalid-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('attaches user payload to the request on valid token', () => {
    const request: { user?: unknown } = { headers: { authorization: 'Bearer valid-token' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(request.user).toEqual({ sub: 'user-1', email: 'a@b.com' });
  });
});
