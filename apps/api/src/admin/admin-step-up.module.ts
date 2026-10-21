import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminStepUpService } from './admin-step-up.service.js';

/**
 * SuperAdmin step-up OTP module (Decision 020 §6).
 *
 * Provides the service for step-up OTP challenges and session management.
 * All routes that require SUPERADMIN authority will use the session token
 * issued by this module after successful OTP verification.
 */
@Module({
  imports: [PrismaModule],
  providers: [AdminStepUpService],
  exports: [AdminStepUpService],
})
export class AdminStepUpModule {}