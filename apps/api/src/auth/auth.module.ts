import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginOtpService } from './login-otp.service.js';
import { MembershipsModule } from '../memberships/memberships.module.js';
import { RegistrationModule } from '../registration/registration.module.js';

/**
 * Stage B6 authentication module.
 *
 * Provides:
 * - AuthService (login, register, refresh, logout)
 * - AuthController (REST endpoints)
 * - JwtModule (sign/verify for access + refresh tokens)
 *
 * PrismaModule and RedisModule are already global; they do not need to be
 * imported here.
 *
 * MembershipsModule is imported so AuthService can inject
 * OrganizationProvisioningService for Service Provider tenant provisioning
 * (approved scope). MembershipsModule re-registers JwtModule locally; that
 * is independent of the JwtModule registered here.
 *
 * RegistrationModule is imported so LoginOtpService can inject the
 * EMAIL_VERIFICATION_PROVIDER bound there (DevConsoleVerificationProvider
 * in bootstrap). This is a provider-token import only - RegistrationModule
 * does not pull AuthModule into a cycle.
 */
@Module({
  imports: [
    JwtModule.register({
      // We pass `secret` per-sign/verify call to distinguish access vs refresh,
      // but the JwtModule still requires a default secret at registration.
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    }),
    MembershipsModule,
    RegistrationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginOtpService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
