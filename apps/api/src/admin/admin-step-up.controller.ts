import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { AdminStepUpGuard } from './guards/admin-step-up.guard.js';
import { AdminStepUpService } from './admin-step-up.service.js';

import {
  adminStepUpChallengeSchema,
  adminStepUpVerifySchema,
  adminStepUpResendSchema,
} from './dto/admin-step-up.dto.js';
import type {
  AdminStepUpChallengeDto,
  AdminStepUpVerifyDto,
  AdminStepUpResendDto,
} from './dto/admin-step-up.dto.js';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';

/**
 * SuperAdmin step-up OTP controller (Decision 020 §6).
 *
 * Provides endpoints for issuing, verifying, and resending step-up OTP challenges.
 * Successful verification creates a short-lived session token that satisfies
 * SUPERADMIN routes when validated by AdminStepUpGuard.
 *
 * All endpoints are @Public() because they require step-up verification, not
 * just JWT authentication. AdminStepUpGuard will validate the session token
 * on protected SUPERADMIN routes.
 */
@Controller('admin/step-up')
@Public()
export class AdminStepUpController {
  constructor(private readonly adminStepUpService: AdminStepUpService) {}

  /**
   * Issue or re-issue the step-up OTP challenge for the authenticated user.
   * Returns whether the OTP was dispatched ('sent') or provider-unavailable
   * ('unavailable'). Does not reveal whether dispatch succeeded or failed.
   */
  @Post('challenge')
  @HttpCode(200)
  async issueChallenge(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(adminStepUpChallengeSchema))
    dto: AdminStepUpChallengeDto,
  ): Promise<{ sendStatus: 'sent' | 'unavailable' }> {
    return this.adminStepUpService.issueChallenge(
      { id: user.sub },
      dto.channel,
      { resetAttempts: false, countResend: false },
    );
  }

  /**
   * Verify the submitted OTP for the authenticated user.
   * On success: creates and returns a raw session token (caller must persist it).
   * On failure: returns standardized error outcome (invalid/locked).
   */
  @Post('verify')
  @HttpCode(200)
  async verify(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(adminStepUpVerifySchema))
    dto: AdminStepUpVerifyDto,
  ): Promise<
    | { outcome: 'verified'; sessionToken: string }
    | { outcome: 'invalid' }
    | { outcome: 'locked'; retryAfterSeconds: number }
  > {
    const verifyResult = await this.adminStepUpService.verify(
      user.sub,
      dto.channel,
      dto.otp,
    );
    if (verifyResult.outcome === 'verified') {
      const sessionToken = await this.adminStepUpService.createSession(user.sub);
      return { outcome: 'verified', sessionToken };
    }
    return verifyResult;
  }

  /**
   * Explicit user resend of the step-up OTP challenge.
   * Returns dispatch status and remaining resend budget.
   */
  @Post('resend')
  @HttpCode(200)
  async resend(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(adminStepUpResendSchema))
    dto: AdminStepUpResendDto,
  ): Promise<{
    sendStatus: 'sent' | 'unavailable';
    resendRemaining: number;
  }> {
    return this.adminStepUpService.resend(user.sub, dto.channel);
  }
}