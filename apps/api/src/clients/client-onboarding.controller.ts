import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientInvitationService } from './client-invitation.service.js';
import { startOnboardingSchema } from './dto/create-client.dto.js';
import { verifyTokenSchema } from './dto/client-common.dto.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';

/**
 * Controlled pre-activation onboarding flows (Client Module V1).
 *
 * These are the ONLY PENDING-time exception paths (they do NOT run
 * ClientAccessGuard). JWT is still required except for token resolution,
 * which is read-only and deliberately exposes no operational data.
 *
 *   - Agency invitation resolve: @PublicAuth (no user context needed).
 *   - Invitation acceptance: the invited User binds to the Client.
 *   - Self-registration start: a verified Individual/Business User begins
 *     Client onboarding (no invitation).
 *   - Activation: mobile-token consumption -> binding + PENDING -> ACTIVE.
 */
@Controller()
export class ClientOnboardingController {
  constructor(
    private readonly onboardingService: ClientOnboardingService,
    private readonly invitationService: ClientInvitationService,
  ) {}

  @Get('invitations/:token')
  @Public()
  @PublicAuth()
  resolveInvitation(@Param('token') token: string) {
    return this.invitationService.resolveInvitation(token);
  }

  @Post('invitations/:token/accept')
  @Public()
  @HttpCode(200)
  acceptInvitation(
    @CurrentUser() user: JwtAccessPayload,
    @Param('token') token: string,
  ) {
    return this.invitationService.acceptInvitation(token, user);
  }

  @Post('onboarding/start')
  @Public()
  @HttpCode(201)
  startSelfRegistration(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(startOnboardingSchema)) dto: unknown,
  ) {
    return this.onboardingService.startSelfRegistration(user, dto as never);
  }

  @Post('onboarding/activate')
  @Public()
  @HttpCode(200)
  activate(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(verifyTokenSchema)) dto: unknown,
  ) {
    return this.onboardingService.completeOnboardingActivation(
      user,
      (dto as { token: string }).token,
    );
  }
}