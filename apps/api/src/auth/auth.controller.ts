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
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { TokenPair } from './auth.service.js';

/**
 * Stage B6 REST auth endpoints.
 *
 * All routes are prefixed with `/api/auth` via the global `/api` prefix set in main.ts.
 * OpenAPI documentation is served at `/docs` (Swagger UI) per the locked stack (AGENTS.md §3).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user and return an access/refresh token pair.',
    description:
      'Creates a User with an Argon2id-hashed password. The refresh token hash is persisted for later rotation. Returns 409 on duplicate email.',
  })
  @ApiCreatedResponse({
    description: 'User registered. Returns access/refresh token pair.',
  })
  @ApiUnauthorizedResponse({ description: 'Reserved for future use.' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<TokenPair> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate with email and password and return tokens.',
    description:
      'Returns 401 on unknown email, wrong password, or inactive account. Returns 200 with a fresh token pair on success.',
  })
  @ApiOkResponse({ description: 'Authenticated. Returns access/refresh token pair.' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token and return a new access/refresh token pair.',
    description:
      'On reuse of a revoked refresh token, all tokens for the user are revoked (defence-in-depth against token theft). Returns 401 on any failure.',
  })
  @ApiOkResponse({ description: 'Refresh token rotated. Returns a new token pair.' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token.' })
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke a refresh token. Requires a valid access token.',
    description:
      'Marks the supplied refresh-token hash as revoked. Idempotent: returns 204 even if the token is already revoked or unknown.',
  })
  @ApiNoContentResponse({ description: 'Refresh token revoked (or no-op).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  logout(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }
}
