import { Module } from '@nestjs/common';

import { MembershipsModule } from '../memberships/memberships.module.js';

import { OtpService } from './otp.service.js';
import { PendingRegistrationService } from './pending-registration.service.js';
import {
  EMAIL_VERIFICATION_PROVIDER,
  WHATSAPP_VERIFICATION_PROVIDER,
} from './providers/verification-provider.port.js';
import { DevConsoleVerificationProvider } from './providers/dev-console.provider.js';
import { RateLimitService } from './rate-limit.service.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { ReminderService } from './reminder/reminder.service.js';

/**
 * Registration Phase v1.0 module.
 *
 * Provides the five staged registration endpoints (start / otp verify /
 * otp resend / password / resume) plus reminder-event processing
 * (state + builder + D1-A rotation; no scheduler - OPEN-8).
 *
 * Providers are provider-agnostic ports (L1/L2). This phase binds ONLY
 * the development Console Provider (OPEN-4), which is hard-disabled in
 * production and never auto-verifies anything. A later approved phase
 * swaps in real WhatsApp/email vendors - no vendor is selected here.
 *
 * MembershipsModule is imported for OrganizationProvisioningService
 * (SERVICE_PROVIDER tenant provisioning after completion; CLIENT users
 * receive no Organization, matching historical behavior).
 * PrismaModule and RedisModule are already global.
 */
@Module({
  imports: [MembershipsModule],
  controllers: [RegistrationController],
  providers: [
    RegistrationService,
    PendingRegistrationService,
    OtpService,
    RateLimitService,
    ReminderService,
    {
      provide: EMAIL_VERIFICATION_PROVIDER,
      useValue: new DevConsoleVerificationProvider('EMAIL'),
    },
    {
      provide: WHATSAPP_VERIFICATION_PROVIDER,
      useValue: new DevConsoleVerificationProvider('WHATSAPP'),
    },
  ],
})
export class RegistrationModule {}
