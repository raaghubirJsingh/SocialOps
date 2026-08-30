import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { OrganizationMembershipGuard } from './organization-membership.guard.js';
import { OrganizationContextService } from '../organization-context.service.js';
import { IS_PUBLIC_KEY } from '../rbac.constants.js';
import { jest } from '@jest/globals';

const VALID_ORG = randomUUID();
const VALID_USER = randomUUID();

function makeContext(
  request: Record<string, unknown>,
): ExecutionContext {
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

describe('OrganizationMembershipGuard', () => {
  let mockResolve: ReturnType<typeof jest.fn>;
  let service: Pick<OrganizationContextService, 'resolve'>;

  beforeEach(() => {
    mockResolve = jest.fn();
    service = { resolve: mockResolve } as Pick<
      OrganizationContextService,
      'resolve'
    >;
  });

  it('returns true and does nothing on @Public() routes', async () => {
    const guard = new OrganizationMembershipGuard(
      reflectorReturning(true),
      service as unknown as OrganizationContextService,
    );

    const result = await guard.canActivate(makeContext({ headers: {} }));
    expect(result).toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when req.user is missing', async () => {
    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    await expect(
      guard.canActivate(makeContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when X-Organization-Id header is missing', async () => {
    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    await expect(
      guard.canActivate(
        makeContext({ user: { sub: VALID_USER, email: 'a@b.com' }, headers: {} }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when X-Organization-Id header is empty', async () => {
    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    await expect(
      guard.canActivate(
        makeContext({
          user: { sub: VALID_USER, email: 'a@b.com' },
          headers: { 'x-organization-id': '   ' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when X-Organization-Id is not a valid UUID', async () => {
    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    await expect(
      guard.canActivate(
        makeContext({
          user: { sub: VALID_USER, email: 'a@b.com' },
          headers: { 'x-organization-id': 'not-a-uuid' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when no matching membership exists', async () => {
    mockResolve.mockRejectedValue(
      new ForbiddenException('Not a member of the requested organization'),
    );

    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    await expect(
      guard.canActivate(
        makeContext({
          user: { sub: VALID_USER, email: 'a@b.com' },
          headers: { 'x-organization-id': VALID_ORG },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockResolve).toHaveBeenCalledWith(VALID_USER, VALID_ORG);
  });

  it('attaches req.organization with the verified role on a valid membership', async () => {
    mockResolve.mockResolvedValue({ id: VALID_ORG, role: 'MEMBER' });

    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    const request: Record<string, unknown> = {
      user: { sub: VALID_USER, email: 'a@b.com' },
      headers: { 'x-organization-id': VALID_ORG },
    };

    const result = await guard.canActivate(makeContext(request));
    expect(result).toBe(true);
    expect(request.organization).toEqual({ id: VALID_ORG, role: 'MEMBER' });
  });

  it('passes the trimmed header value to OrganizationContextService', async () => {
    mockResolve.mockResolvedValue({ id: VALID_ORG, role: 'ADMIN' });

    const guard = new OrganizationMembershipGuard(
      reflectorReturning(false),
      service as unknown as OrganizationContextService,
    );

    const request: Record<string, unknown> = {
      user: { sub: VALID_USER, email: 'a@b.com' },
      headers: { 'x-organization-id': `  ${VALID_ORG}  ` },
    };

    await guard.canActivate(makeContext(request));
    expect(mockResolve).toHaveBeenCalledWith(VALID_USER, VALID_ORG);
  });

  it('queries the reflector with both handler and class targets (NestJS convention)', async () => {
    // The NestJS `Reflector.getAllAndOverride` contract is: pass
    // [handler, class] targets and let it pick the closest match. This
    // test pins the *order* of targets the guard passes in so the
    // handler-level @Public() always wins over the class-level one.
    const seen: unknown[][] = [];
    const spy: Reflector = {
      getAllAndOverride: <T>(key: string, targets: unknown[]): T | undefined => {
        seen.push(targets);
        if (key === IS_PUBLIC_KEY) return true as unknown as T;
        return undefined;
      },
    } as unknown as Reflector;

    const guard = new OrganizationMembershipGuard(
      spy,
      service as unknown as OrganizationContextService,
    );

    const ctx = makeContext({ headers: {} });
    await guard.canActivate(ctx);

    expect(seen).toHaveLength(1);
    // Handler target must come first so per-route @Public() takes
    // precedence over per-controller @Public().
    expect(seen[0]).toEqual([ctx.getHandler(), ctx.getClass()]);
  });
});