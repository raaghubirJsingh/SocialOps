import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleGuard } from './role.guard.js';
import { MINIMUM_ROLE_KEY } from '../rbac.constants.js';
import type { RbacRole } from '../organization-roles.js';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  return {
    getAllAndOverride: () => value,
  } as unknown as Reflector;
}

function reflectorForKey(required: RbacRole | undefined): Reflector {
  return {
    getAllAndOverride: <T>(key: string): T | undefined =>
      key === MINIMUM_ROLE_KEY ? (required as unknown as T) : undefined,
  } as unknown as Reflector;
}

describe('RoleGuard', () => {
  it('is a no-op when no @RequireMinimumRole metadata is present', () => {
    const guard = new RoleGuard(reflectorReturning(undefined));
    const result = guard.canActivate(
      makeContext({ user: { sub: 'u1' }, organization: { id: 'o1', role: 'VIEWER' } }),
    );
    expect(result).toBe(true);
  });

  it('allows the request when the user role meets the required minimum', () => {
    const guard = new RoleGuard(reflectorForKey('ADMIN'));
    const result = guard.canActivate(
      makeContext({ organization: { id: 'o1', role: 'ADMIN' } }),
    );
    expect(result).toBe(true);
  });

  it('denies with ForbiddenException when the user role is below the required minimum', () => {
    const guard = new RoleGuard(reflectorForKey('ADMIN'));
    expect(() =>
      guard.canActivate(
        makeContext({ organization: { id: 'o1', role: 'VIEWER' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when no organization context is attached', () => {
    const guard = new RoleGuard(reflectorForKey('MEMBER'));
    expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException);
  });

  it('OWNER satisfies ADMIN', () => {
    const guard = new RoleGuard(reflectorForKey('ADMIN'));
    const result = guard.canActivate(
      makeContext({ organization: { id: 'o1', role: 'OWNER' } }),
    );
    expect(result).toBe(true);
  });

  it('ADMIN does NOT satisfy OWNER', () => {
    const guard = new RoleGuard(reflectorForKey('OWNER'));
    expect(() =>
      guard.canActivate(
        makeContext({ organization: { id: 'o1', role: 'ADMIN' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('MEMBER satisfies MEMBER but not ADMIN', () => {
    const guardMember = new RoleGuard(reflectorForKey('MEMBER'));
    expect(
      guardMember.canActivate(
        makeContext({ organization: { id: 'o1', role: 'MEMBER' } }),
      ),
    ).toBe(true);

    const guardAdmin = new RoleGuard(reflectorForKey('ADMIN'));
    expect(() =>
      guardAdmin.canActivate(
        makeContext({ organization: { id: 'o1', role: 'MEMBER' } }),
      ),
    ).toThrow(ForbiddenException);
  });
});
