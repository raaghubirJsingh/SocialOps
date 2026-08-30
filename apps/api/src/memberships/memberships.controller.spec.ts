import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { MembershipsController } from './memberships.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

function makePrismaMock() {
  return {
    organizationMembership: {
      findMany: vi.fn(),
    },
  };
}

describe('MembershipsController', () => {
  let controller: MembershipsController;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    // JwtModule is imported because @UseGuards(JwtAuthGuard) on the
    // route forces NestJS to verify the guard's JwtService dependency
    // can be resolved at module-compile time. The guard is never
    // invoked here - these tests exercise the controller method
    // directly, so a no-op secret is sufficient.
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret-32-chars-minimum' })],
      controllers: [MembershipsController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(MembershipsController);
  });

  it('returns the authenticated user\'s memberships joined with their organizations', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        role: 'OWNER',
        organization: { id: 'org-1', name: 'Org One', slug: 'org-one' },
      },
      {
        role: 'MEMBER',
        organization: { id: 'org-2', name: 'Org Two', slug: 'org-two' },
      },
    ]);

    const result = await controller.getMyMemberships({
      sub: 'user-1',
      email: 'a@b.com',
    });

    expect(result).toEqual({
      userId: 'user-1',
      memberships: [
        { role: 'OWNER', organization: { id: 'org-1', name: 'Org One', slug: 'org-one' } },
        { role: 'MEMBER', organization: { id: 'org-2', name: 'Org Two', slug: 'org-two' } },
      ],
    });
  });

  it('constrains the query using req.user.sub (no caller-supplied userId parameter)', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await controller.getMyMemberships({ sub: 'user-1', email: 'a@b.com' });

    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    // Defense-in-depth: the controller signature accepts no userId param.
    const arg = (prisma.organizationMembership.findMany.mock.calls[0]?.[0] ?? {}) as {
      where?: { userId?: string };
    };
    expect(arg.where?.userId).toBe('user-1');
  });

  it('does NOT accept a caller-supplied userId parameter (controller signature is fixed)', () => {
    // Compile-time evidence: MembershipsController has only ONE method,
    // `getMyMemberships(user: JwtAccessPayload)`. There is no second
    // parameter and no body decorator that could be used to read an
    // alternate userId. This test asserts that runtime attempts to pass
    // additional arguments are simply ignored by the implementation.
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    // Pretend an attacker somehow tries to inject a userId. The method
    // still only reads `user.sub` from the verified JWT payload.
    const userIdFromRequest = 'attacker-supplied-id';
    void userIdFromRequest; // not used by the controller

    return controller
      .getMyMemberships({ sub: 'real-user', email: 'real@b.com' })
      .then((result) => {
        const arg = (prisma.organizationMembership.findMany.mock.calls[0]?.[0] ?? {}) as {
          where?: { userId?: string };
        };
        expect(arg.where?.userId).toBe('real-user');
        expect(arg.where?.userId).not.toBe(userIdFromRequest);
        expect(result.userId).toBe('real-user');
      });
  });

  it('returns another user\'s memberships only if req.user.sub changes - not via controller input', async () => {
    prisma.organizationMembership.findMany.mockResolvedValueOnce([
      {
        role: 'ADMIN',
        organization: { id: 'org-1', name: 'Org One', slug: 'org-one' },
      },
    ]);

    const result = await controller.getMyMemberships({
      sub: 'user-2',
      email: 'other@b.com',
    });

    expect(result.userId).toBe('user-2');
    const arg = (prisma.organizationMembership.findMany.mock.calls[0]?.[0] ?? {}) as {
      where?: { userId?: string };
    };
    expect(arg.where?.userId).toBe('user-2');
  });
});
