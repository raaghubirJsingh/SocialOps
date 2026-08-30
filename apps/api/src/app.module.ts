import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RbacModule } from './rbac/rbac.module.js';
import { OrganizationMembershipGuard } from './rbac/guards/organization-membership.guard.js';
import { MembershipsModule } from './memberships/memberships.module.js';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    RbacModule,
    MembershipsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Stage B7: the B7 plan requires the guard order
    //   JWT authentication
    //     ↓
    //   organization membership validation
    //   ↓
    //   optional RoleGuard
    //   ↓
    //   controller
    // Both JWT and organization-membership checks are therefore
    // registered globally. NestJS executes global guards in the
    // order they are provided, so JwtAuthGuard is listed FIRST.
    //
    // JwtAuthGuard respects the @PublicAuth() marker (B7: this is
    // the minimal additive change that lets health / register /
    // login / refresh skip JWT verification). It does NOT respect
    // @Public() - that marker only bypasses
    // OrganizationMembershipGuard. On protected routes it
    // attaches `req.user` so OrganizationMembershipGuard can read
    // `req.user.sub` (B7 plan section 4 step 2).
    //
    // OrganizationMembershipGuard also respects @Public() (B7 plan
    // section 5). On protected routes it requires the verified
    // `X-Organization-Id` header and a matching OrganizationMembership
    // row for (req.user.sub, organizationId).
    //
    // RoleGuard is NOT global; it is applied at the route level
    // via @UseGuards(RoleGuard) in any controller that uses
    // @RequireMinimumRole(...). See e.g. the rbac-test route in
    // test/rbac.integration.spec.ts.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationMembershipGuard },
  ],
})
export class AppModule {}
