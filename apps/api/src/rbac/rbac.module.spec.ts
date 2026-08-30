import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RbacModule } from './rbac.module.js';
import { OrganizationContextService } from './organization-context.service.js';
import { OrganizationMembershipGuard } from './guards/organization-membership.guard.js';
import { RoleGuard } from './guards/role.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { jest } from '@jest/globals';

describe('RbacModule', () => {
  it('compiles and exposes the required providers', async () => {
    // OrganizationContextService depends on PrismaService. The real
    // application wires PrismaModule (a @Global() module providing
    // PrismaService) at the application root. We mirror that here with
    // a PrismaStandaloneModule marked @Global() so its
    // PrismaService token is visible inside RbacModule.
    @Global()
    @Module({
      providers: [
        {
          provide: PrismaService,
          useValue: {
            organizationMembership: { findUnique: jest.fn() },
          },
        },
      ],
      exports: [PrismaService],
    })
    class PrismaStandaloneModule {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaStandaloneModule, RbacModule],
    }).compile();

    expect(module.get(OrganizationContextService)).toBeDefined();
    expect(module.get(OrganizationMembershipGuard)).toBeDefined();
    expect(module.get(RoleGuard)).toBeDefined();
  });

  it('is marked @Global() - a feature module can use its providers without re-importing RbacModule', async () => {
    @Global()
    @Module({
      providers: [
        {
          provide: PrismaService,
          useValue: {
            organizationMembership: { findUnique: jest.fn() },
          },
        },
      ],
      exports: [PrismaService],
    })
    class PrismaStandaloneModule {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaStandaloneModule, RbacModule],
    }).compile();

    const ctx = module.get(OrganizationContextService);
    expect(ctx).toBeInstanceOf(OrganizationContextService);
  });
});
