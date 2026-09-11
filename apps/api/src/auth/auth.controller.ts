import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { registerSchema } from './dto/register.dto.js';
import { refreshTokenSchema } from './dto/refresh-token.dto.js';
import { verifyEmailSchema } from './dto/verify-email.dto.js';
import { resendVerificationSchema } from './dto/resend-verification.dto.js';

import { Public } from '../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';

import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { ResendVerificationDto } from './dto/resend-verification.dto.js';
import type { RegisterResult } from './dto/register-response.dto.js';
import type { LoginResult } from './dto/login-response.dto.js';
import type { TokenPair } from './auth.service.js';

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
 * register:
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
   * Register a new user.
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   *
   * The response body is a discriminated union on `status`:
   *   - `verification_required` (production): the new user is INACTIVE
   *     with `emailVerifiedAt = null`; an `EmailVerificationToken` row
   *     has been created. The client must direct the user to
   *     `/verify-email` to complete verification before login.
   *   - `registration_complete` (dev-only bypass): the new user is
   *     ACTIVE with `emailVerifiedAt` populated. The client must direct
   *     the user to `/login`. This branch is only ever produced when
   *     the dev-only `AUTH_DEV_AUTO_VERIFY_REGISTER` env var is open
   *     AND `NODE_ENV` is not `production`.
   *
   * In both branches: registration NEVER issues a JWT, access token,
   * refresh token, or session. The session is always created by
   * `POST /api/auth/login`. Returns 403 on duplicate email.
   */
  @Post('register')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register a new user. The response discriminator indicates whether email verification is still required (production) or already complete (dev-only bypass).',
    description:
      'Creates a User with an Argon2id-hashed password and (in production) queues an email verification token (single-use, 24h expiry, only the SHA-256 hash is persisted). Registration NEVER returns a JWT, access token, refresh token, or session - login is the only way to obtain a session. Returns 403 on duplicate email. In the dev-only `AUTH_DEV_AUTO_VERIFY_REGISTER` bypass mode (NON-production only), the new user is created ACTIVE with `emailVerifiedAt` populated and the response is `status: "registration_complete"`.',
  })
  @ApiCreatedResponse({
    description:
      'User registered. Response body is one of: { status: "verification_required", email } (production) or { status: "registration_complete", email } (dev-only bypass). The client must read the `status` discriminator and navigate to /verify-email or /login respectively.',
  })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<RegisterResult> {
    return this.authService.register(dto);
  }

  /**
   * Authenticate an existing user.
   *
   * Public authentication endpoint:
   * - No JWT required.
   * - No organization context required.
   */
  @Post('login')
  @PublicAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate with email and password and return tokens.',
    description:
      'Returns 401 on unknown email, wrong password, or inactive account. Returns 200 with a fresh token pair and the authenticated user identity (id, email, fullName, accountType) on success. accountType is product metadata (AGENTS.md §17) - not a role, not an authorization state.',
  })
  @ApiOkResponse({
    description:
      'Authenticated. Returns access/refresh token pair and the user identity fields needed to render the post-login UI.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
  })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<LoginResult> {
    return this.authService.login(dto);
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