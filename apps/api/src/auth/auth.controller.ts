import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

import { loginSchema } from './dto/login.dto.js';
import { registerEmployeeSchema } from './dto/register-employee.dto.js';
import { refreshTokenSchema } from './dto/refresh-token.dto.js';
import { verifyEmailSchema } from './dto/verify-email.dto.js';
import { resendVerificationSchema } from './dto/resend-verification.dto.js';

import { Public } from '../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';

import type { LoginDto } from './dto/login.dto.js';
import type { RegisterEmployeeDto } from './dto/register-employee.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { ResendVerificationDto } from './dto/resend-verification.dto.js';
import type { RegisterResult } from './dto/register-response.dto.js';
import type { LoginResult } from './dto/login-response.dto.js';
import type { TokenPair } from './auth.service.js';
import { verifyLoginOtpSchema } from './dto/verify-login-otp.dto.js';
import type { VerifyLoginOtpDto } from './dto/verify-login-otp.dto.js';

/**
 * Stage B7 REST authentication endpoints.
 *
 * Authentication and organization-context bypasses are intentionally
 * separated:
 *
 * @Public()
 *   -> bypasses OrganizationMembershipGuard only.
 *
 * @PublicAuth()
 *   -> bypasses JwtAuthGuard only.
 *
 * Therefore:
 *
 * register-employee:
 *   JWT                  -> NOT required
 *   Organization context -> NOT required
 *
 * login:
 *   JWT                  -> NOT required
 *   Organization context -> NOT required
 *
 * verify-email:
 *   JWT                  -> NOT required
 *   Organization context -> NOT required
 *
 * resend-verification:
 *   JWT                  -> NOT required
 *   Organization context -> NOT required
 *
 * refresh:
 *   JWT                  -> NOT required
 *   Organization context -> NOT required
 *
 * logout:
 *   JWT                  -> REQUIRED
 *   Organization context -> NOT required
 *
 * This separation is required by Stage B7.
 */
@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register an EMPLOYEE account (Employee Module V1, Phase 2).
   *
   * Public authentication endpoint:
   * - No JWT required (@PublicAuth, same as /register).
   * - No organization context required (class-level @Public).
   *
   * Creates the User and the 1:1 EmployeeProfile in ONE atomic
   * transaction. Same verification contract as /register: the response
   * discriminator is `verification_required` (production) or
   * `registration_complete` (dev-only bypass); NO tokens are ever
   * issued at registration. accountType stays null — the EmployeeProfile
   * row is the discriminator. Returns 403 on duplicate email.
   */
  @Post('register-employee')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register an employee account. Same response discriminator as /register; the User and the 1:1 EmployeeProfile are created atomically.',
    description:
      'Creates a User (Argon2id-hashed password, accountType null) plus the 1:1 EmployeeProfile in one transaction, and (in production) queues an email verification token (single-use, 24h expiry, only the SHA-256 hash is persisted). Registration NEVER returns a JWT, access token, refresh token, or session. Returns 403 on duplicate email. Dev-only AUTH_DEV_AUTO_VERIFY_REGISTER bypass behaves like /register.',
  })
  @ApiCreatedResponse({
    description:
      'Employee registered. Response body is one of: { status: "verification_required", email } (production) or { status: "registration_complete", email } (dev-only bypass).',
  })
  registerEmployee(
    @Body(new ZodValidationPipe(registerEmployeeSchema)) dto: RegisterEmployeeDto,
  ): Promise<RegisterResult> {
    return this.authService.registerEmployee(dto);
  }

  /**
   * Authenticate an existing user (step 1 of 2).
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * Mandatory email OTP (single-box login): after the password is
   * validated, this endpoint issues a login OTP challenge and returns
   * `otp_required`. The user must verify the OTP via
   * POST /api/auth/login/verify-otp before tokens are issued.
   * No tokens are ever returned from this endpoint.
   */
  @Post('login')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate with email and password (step 1 of 2). Returns otp_required with a challenge; verify via POST /api/auth/login/verify-otp.',
    description:
      'Returns 401 on unknown email, wrong password, or inactive account. Returns 200 with { status: "otp_required", email, challengeExpiresAt } on success. The OTP must be verified via POST /api/auth/login/verify-otp before tokens are issued. accountType is product metadata (AGENTS.md §17) - not a role, not an authorization state.',
  })
  @ApiOkResponse({
    description:
      'OTP challenge issued. Returns { status: "otp_required", email, challengeExpiresAt }. The frontend must present an OTP input and call POST /api/auth/login/verify-otp.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
  })
  @ApiForbiddenResponse({
    description: 'Account is deactivated or email not verified.',
  })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  /**
   * Verify the login OTP and issue the token pair (step 2 of 2).
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * This is the second factor of the mandatory email OTP login flow.
   * The user has already validated their password (via POST /api/auth/
   * login) and received an OTP challenge. This endpoint verifies the
   * OTP and, on success, issues the access/refresh token pair.
   */
  @Post('login/verify-otp')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify the login OTP and issue the token pair (step 2 of 2).',
    description:
      'Returns 401 if the email is unknown or the account is inactive/unverified. Returns 400 if the OTP is invalid or expired. Returns 403 if the challenge is locked (3 wrong attempts -> 1 hour). Returns 200 with a fresh token pair and the authenticated user identity on success.',
  })
  @ApiOkResponse({
    description:
      'OTP verified. Returns access/refresh token pair and the user identity fields needed to render the post-login UI.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired OTP.',
  })
  @ApiForbiddenResponse({
    description: 'Challenge locked (3 wrong attempts -> 1 hour).',
  })
  verifyLoginOtp(
    @Body(new ZodValidationPipe(verifyLoginOtpSchema))
    dto: VerifyLoginOtpDto,
  ): Promise<LoginResult> {
    return this.authService.verifyLoginOtp(dto.email, dto.otp);
  }

  /**
   * Resend the login OTP.
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * Enforces a 60-second resend cooldown and a maximum of 3 successful
   * resends. Returns 429 when the cooldown is active.
   */
  @Post('login/otp/resend')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the login OTP.',
    description:
      'Enforces a 60-second resend cooldown and a maximum of 3 successful resends. Returns 429 when the cooldown is active. Returns 403 when the resend limit is reached or the challenge is locked.',
  })
  @ApiOkResponse({
    description: 'OTP resent. Returns { sendStatus, resendRemaining }.',
  })
  @ApiForbiddenResponse({
    description: 'Resend limit reached or challenge locked.',
  })
  resendLoginOtp(
    @Body(new ZodValidationPipe(resendVerificationSchema))
    dto: ResendVerificationDto,
  ): Promise<{ sendStatus: 'sent' | 'unavailable'; resendRemaining: number }> {
    return this.authService.resendLoginOtp(dto.email);
  }

  /**
   * Verify an email address with a single-use token.
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * The token comes from the verification link. Only SHA-256(token) is
   * stored; the raw token is never persisted. Invalid, expired, and
   * already-used tokens all produce the SAME generic 400 response so the
   * endpoint never reveals which condition occurred.
   */
  @Post('verify-email')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email address using a single-use token.',
    description:
      'Consumes the token from the verification link and marks the account as verified. Invalid, expired, and already-used tokens all return the same generic 400 response.',
  })
  @ApiOkResponse({
    description: 'Email verified. Returns {"status":"verified"}.',
  })
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto,
  ): Promise<{ status: 'verified' }> {
    return this.authService.verifyEmail(dto.token);
  }

  /**
   * Queue a new verification email for an unverified account.
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * The response is GENERIC and IDENTICAL ({"status":"queued"}) whether
   * the email exists, does not exist, or is already verified - the
   * endpoint must not enable email enumeration. Any previous unused
   * verification tokens are invalidated; only the newest token works.
   */
  @Post('resend-verification')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue a new verification email for an unverified account.',
    description:
      'Always returns {"status":"queued"} regardless of account state to prevent email enumeration. Invalidates all previous unused verification tokens.',
  })
  @ApiOkResponse({
    description: 'Request accepted. Returns {"status":"queued"}.',
  })
  resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema))
    dto: ResendVerificationDto,
  ): Promise<{ status: 'queued' }> {
    return this.authService.resendVerification(dto.email);
  }

  /**
   * Rotate a refresh token.
   *
   * Public authentication endpoint:
   * - No access JWT required.
   * - No organization context required.
   *
   * The refresh token itself is the credential being validated by
   * AuthService.
   */
  @Post('refresh')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rotate a refresh token and return a new access/refresh token pair.',
    description:
      'On reuse of a revoked refresh token, all tokens for the user are revoked (defence-in-depth against token theft). Returns 401 on any failure.',
  })
  @ApiOkResponse({
    description:
      'Refresh token rotated. Returns a new access/refresh token pair.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token.',
  })
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Logout / revoke a refresh token.
   *
   * IMPORTANT:
   *
   * @Public() means the organization guard does NOT require
   * X-Organization-Id.
   *
   * We intentionally DO NOT use @PublicAuth() here.
   *
   * Therefore JwtAuthGuard must authenticate the caller.
   *
   * Result:
   *
   *   Authorization: Bearer <valid-access-token> -> REQUIRED
   *   X-Organization-Id                       -> NOT required
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke a refresh token. Requires a valid access token.',
    description:
      'Marks the supplied refresh-token hash as revoked. Idempotent: returns 204 even if the token is already revoked or unknown.',
  })
  @ApiNoContentResponse({
    description: 'Refresh token revoked (or no-op).',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
  })
  logout(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }
}
