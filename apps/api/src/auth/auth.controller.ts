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

import { Public } from '../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';

import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
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
   */
  @Post('register')
  @PublicAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user and return an access/refresh token pair.',
    description:
      'Creates a User with an Argon2id-hashed password. The refresh token hash is persisted for later rotation. Returns 409 on duplicate email.',
  })
  @ApiCreatedResponse({
    description: 'User registered. Returns access/refresh token pair.',
  })
  @ApiUnauthorizedResponse({
    description: 'Reserved for future use.',
  })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<TokenPair> {
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
      'Returns 401 on unknown email, wrong password, or inactive account. Returns 200 with a fresh token pair on success.',
  })
  @ApiOkResponse({
    description: 'Authenticated. Returns access/refresh token pair.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
  })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<TokenPair> {
    return this.authService.login(dto);
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