import { createHash } from 'node:crypto';

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';

import {
  otpResendSchema,
  otpVerifySchema,
  registrationPasswordSchema,
  registrationResumeSchema,
  registrationStartSchema,
} from './dto/registration.dto.js';
import type {
  OtpResendDto,
  OtpVerifyDto,
  RegistrationPasswordDto,
  RegistrationResumeDto,
  RegistrationStartDto,
} from './dto/registration.dto.js';
import { RateLimitService } from './rate-limit.service.js';
import type { RegistrationRateBucket } from './rate-limit.service.js';
import { RegistrationService } from './registration.service.js';

/**
 * Registration Phase v1.0 staged endpoints. All five routes:
 *   - JWT NOT required (@PublicAuth bypasses JwtAuthGuard only)
 *   - organization context NOT required (@Public bypasses the
 *     OrganizationMembershipGuard only)
 * Protected instead by: the resumeToken stage credential (SHA-256
 * lookup; not a JWT/login/session), Redis rate limiting (OPEN-3 exact
 * budgets; 429 + Retry-After), OTP attempt/lock rules, and lazy expiry.
 * Registration NEVER issues a session; completion returns a status
 * discriminator only and the user continues at POST /api/auth/login
 * (login/refresh unchanged).
 */

/** Minimal structural view of the response (passthrough mode). */
interface HeaderSink {
  set(name: string, value: string): unknown;
}

interface IpRequest {
  ip?: string;
}

@ApiTags('auth')
@Public()
@Controller('auth/registration')
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private clientIp(req: IpRequest): string {
    return req.ip ?? 'unknown';
  }

  /** SHA-256 of the stage credential - raw tokens never enter Redis keys. */
  private scope(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async enforce(
    res: HeaderSink,
    bucket: RegistrationRateBucket,
    parts: { ip: string; scope?: string; channel?: string },
  ): Promise<void> {
    const result = await this.rateLimit.consume(bucket, parts);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      throw RateLimitService.rateLimitException(result.retryAfterSeconds);
    }
  }

  @Post('start')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Start or resume a pending registration (rate-limited 5/15min/IP).',
    description:
      'Creates a PendingRegistration (no User yet) or resumes an existing active one for the same email (same row, no timer reset). Dispatches BOTH Email and WhatsApp OTP challenges simultaneously. Returns the raw resumeToken ONCE (stage credential, not a session). Explicit 403 "Email already in use" when the email belongs to an existing User.',
  })
  @ApiCreatedResponse({
    description:
      'Pending registration active: { status, resumeToken, expiresAt, maskedEmail, maskedPhone, accountType, emailVerified, whatsappVerified, sendStatus, resendRemaining, lockedUntil }.',
  })
  async start(
    @Body(new ZodValidationPipe(registrationStartSchema))
    dto: RegistrationStartDto,
    @Req() req: IpRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ): Promise<unknown> {
    await this.enforce(res, 'start', { ip: this.clientIp(req) });
    return this.registration.start(dto);
  }

  @Post('otp/verify')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify one channel registration OTP (rate-limited 10/15min/IP+registration).',
    description:
      '6-digit numeric code; 5-minute validity; 3 wrong attempts trigger a 1-hour temporary lock that never deletes the registration. Wrong/expired/used codes are uniform. No raw OTP is ever returned by the API.',
  })
  @ApiOkResponse({ description: '{ channel, verified, bothVerified }.' })
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) dto: OtpVerifyDto,
    @Req() req: IpRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ): Promise<unknown> {
    await this.enforce(res, 'otpVerify', {
      ip: this.clientIp(req),
      scope: this.scope(dto.resumeToken),
    });
    return this.registration.verify(dto);
  }
  // CTRL-CONTINUE

  @Post('otp/resend')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resend one channel registration OTP (rate-limited 6/15min/IP+channel).',
    description:
      'Maximum 3 SUCCESSFUL resends per channel; resend does not reset the wrong-attempt count; a provider-unavailable dispatch consumes no quota; the initial /start dispatch never counts.',
  })
  @ApiOkResponse({ description: '{ channel, sendStatus, resendRemaining }.' })
  async resendOtp(
    @Body(new ZodValidationPipe(otpResendSchema)) dto: OtpResendDto,
    @Req() req: IpRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ): Promise<unknown> {
    await this.enforce(res, 'otpResend', {
      ip: this.clientIp(req),
      channel: dto.channel,
    });
    return this.registration.resend(dto);
  }

  @Post('password')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create the account after dual verification (rate-limited 5/15min/IP+registration).',
    description:
      'Requires BOTH Email and WhatsApp verification plus a non-null accountType (CLIENT or SERVICE_PROVIDER - never guessed; L13). Creates the User (phoneVerifiedAt + emailVerifiedAt stamped), DELETES the pending registration (current resumeToken dies with it), and returns a status discriminator only. NEVER returns a JWT/session - continue at /login. Minimum 8 characters; confirmPassword is UI-only and never sent. Email is immutable from this moment (OPEN-9).',
  })
  @ApiCreatedResponse({ description: '{ status: "registration_complete" }.' })
  async createPassword(
    @Body(new ZodValidationPipe(registrationPasswordSchema))
    dto: RegistrationPasswordDto,
    @Req() req: IpRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ): Promise<unknown> {
    await this.enforce(res, 'password', {
      ip: this.clientIp(req),
      scope: this.scope(dto.resumeToken),
    });
    return this.registration.password(dto);
  }

  @Post('resume')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resume an in-flight registration from the emailed link (rate-limited 10/15min/IP).',
    description:
      'Validates the resumeToken (stage credential) and returns a stage snapshot. Creates NO session; invalid/expired/rotated tokens yield the uniform 404.',
  })
  @ApiOkResponse({
    description:
      '{ stage, expiresAt, accountType, fullName, maskedEmail, maskedPhone, emailVerified, whatsappVerified, resendRemaining, lockedUntil }.',
  })
  async resume(
    @Body(new ZodValidationPipe(registrationResumeSchema))
    dto: RegistrationResumeDto,
    @Req() req: IpRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ): Promise<unknown> {
    await this.enforce(res, 'resume', { ip: this.clientIp(req) });
    return this.registration.resume(dto);
  }
}
