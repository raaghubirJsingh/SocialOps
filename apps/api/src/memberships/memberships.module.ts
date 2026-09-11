import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MembershipsController } from './memberships.controller.js';
import { OrganizationProvisioningService } from './organization-provisioning.service.js';

/**
 * Stage B7 memberships module.
 *
 * Hosts the single B7 production route (`GET /api/memberships/me`).
 *
 * `JwtModule` is imported locally because the route uses
 * `@UseGuards(JwtAuthGuard)`, which depends on `JwtService`. The
 * B6 authentication module also imports `JwtModule` with the same
 * shape; the two are independent and each route that needs JWT
 * verification imports the module that provides it.
 *
 * PrismaModule and RbacModule are global and do not need to be
 * imported here.
 *
 * `OrganizationProvisioningService` is exported so AuthModule can inject
 * it for Service Provider tenant provisioning (approved scope). It does
 * not affect the `/memberships/me` route, which remains JWT-only and
 * read-only.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    }),
  ],
  controllers: [MembershipsController],
  providers: [OrganizationProvisioningService],
  exports: [OrganizationProvisioningService],
})
export class MembershipsModule {}
