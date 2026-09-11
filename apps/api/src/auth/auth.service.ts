import {
  BadRequestException,

  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationProvisioningService } from '../memberships/organization-provisioning.service.js';
import type { JwtAccessPayload, JwtRefreshPayload } from './types/jwt-payload.type.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

import type { RegisterResult } from './dto/register-response.dto.js';
import type { LoginResult } from './dto/login-response.dto.js';
import { isAuthDevAutoVerifyRegister } from './dev-auto-verify.js';
import { maybeLogVerificationUrl } from './email-audit.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
/**
 * Verification tokens are single-use and expire after 24 hours
 * (approved plan, instruction 10).
 */
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly organizationProvisioning: OrganizationProvisioningService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 2,
    });
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private generateTokenPair(userId: string, email: string, accountType: string | null): TokenPair {
    const accessPayload: JwtAccessPayload = { sub: userId, email, accountType };
    const jti = randomUUID();
    const refreshPayload: JwtRefreshPayload = { sub: userId, jti };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900),
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: Number(process.env.JWT_REFRESH_TTL ?? 604800),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Persist a new refresh-token hash so it can be matched on rotation.
   * We store only the SHA-256 hash, never the raw token (AGENTS.md §8).
   */
  private async persistRefreshToken(userId: string, rawToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawToken);
    const ttlSeconds = Number(process.env.JWT_REFRESH_TTL ?? 604800);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  private async persistTokensForUser(userId: string, email: string, accountType: string | null): Promise<TokenPair> {
    const tokens = this.generateTokenPair(userId, email, accountType);
    await this.persistRefreshToken(userId, tokens.refreshToken); // Note: refresh token does not need accountType (prevent key rotation breaking auth state)
    return tokens;
  }

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const passwordHash = await this.hashPassword(dto.password);

    // Dev-only temporary bypass. See `dev-auto-verify.ts` for the
    // strict string-match + NODE_ENV hard-stop contract. The default
    // is OFF (production-safe). When ON, the new user is created
    // ACTIVE + already verified, no EmailVerificationToken is issued,
    // and the response is `status: 'registration_complete'`. The
    // server STILL issues no JWT, no access token, no refresh token,
    // and no session: registration creates the account; login creates
    // the session. This preserves the existing authentication
    // boundary (AGENTS.md §17.2).
    const skipVerification = isAuthDevAutoVerifyRegister();

    let user: { id: string; email: string };

    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          // displayName is back-compat (AGENTS.md §17.2). It is
          // populated from fullName at registration so existing code
          // that reads `displayName` continues to work unchanged.
          displayName: dto.fullName,
          fullName: dto.fullName,
          // Phone is optional at this phase. SMS/OTP/mobile
          // verification are explicitly out of scope (AGENTS.md §13).
          phone: dto.phone ?? null,
          // accountType is the public registration selection
          // (AGENTS.md §17.1). It is product metadata, NOT a role
          // and NOT authorization state. Roles live on
          // OrganizationMembership (AGENTS.md §7).
          accountType: dto.accountType,
          // New users are normally INACTIVE until they verify their
          // email (AGENTS.md §17.2). The dev-only bypass flips
          // `isActive` to true and populates `emailVerifiedAt` so the
          // user can log in immediately. The verification transaction
          // additionally sets `isActive = true` together with
          // `emailVerifiedAt` for the production path.
          isActive: skipVerification,
          emailVerifiedAt: skipVerification ? new Date() : null,
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ForbiddenException('Email already in use');
      }
      throw error;
    }

    if (!skipVerification) {
      // Production path: queue a single-use 24h EmailVerificationToken.
      await this.issueVerificationToken(user.id, user.email);
    } else {
      // Local-only auto-verify skips the verification endpoint, so
      // tenant provisioning must run here. Production registration
      // still creates no Organization (AGENTS.md §17.2).
      await this.organizationProvisioning.ensureForServiceProvider(user.id);
    }

    // Registration NEVER issues a JWT, access token, refresh token, or
    // any authenticated session (approved plan; AGENTS.md §17.2). The
    // response discriminator tells the frontend which page to navigate
    // to: /verify-email in production, /login in dev-bypass.
    return skipVerification
      ? { status: 'registration_complete', email: user.email }
      : { status: 'verification_required', email: user.email };
  }

  /**
   * Generate and persist a fresh email-verification token.
   *
   * Security properties (approved plan):
   *   - 32 cryptographically secure random bytes, base64url-encoded.
   *   - ONLY SHA-256(token) is persisted; the raw token never touches
   *     the database.
   *   - 24-hour expiry, single use.
   *   - All previous unused tokens for the user are invalidated first,
   *     so only the newest token can ever be consumed.
   */
  private async issueVerificationToken(
    userId: string,
    email: string,
  ): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    // Local development audit logging is delegated to the email-audit
    // helper so the gate value is owned by a single source. The
    // helper is a no-op when BOOT_ARTIFACTS_ALLOWED is not 'true' and
    // production email delivery remains explicitly deferred.
    maybeLogVerificationUrl(this.logger, email, rawToken);
  }

  /**
   * Verify an email address by consuming a single-use token.
   *
   * The token is claimed atomically inside a transaction
   * (updateMany conditioned on usedAt = null), so two concurrent
   * requests can never both consume the same token. Invalid, expired,
   * and already-used tokens all produce the SAME generic error so the
   * endpoint never reveals which condition occurred (approved plan).
   */
  async verifyEmail(rawToken: string): Promise<{ status: 'verified' }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invalid = () =>
      new BadRequestException('Invalid or expired verification token');

    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
      throw invalid();
    }

    await this.prisma.$transaction(async (tx) => {
      // Atomic single-use claim: only succeeds when the row is still
      // unused. A concurrent attempt loses the race here and receives
      // the same generic error as any other invalid token.
      const claim = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw invalid();
      }

      const user = await tx.user.findUnique({
        where: { id: token.userId },
        select: { id: true, emailVerifiedAt: true, isActive: true },
      });
      if (!user) {
        throw invalid();
      }

      // Keep the ORIGINAL emailVerifiedAt if the account was somehow
      // already verified; never move the timestamp. Likewise keep
      // isActive = true once it is already true so we do not toggle
      // it back and forth.
      const updates: { emailVerifiedAt?: Date; isActive?: boolean } = {};
      if (!user.emailVerifiedAt) {
        updates.emailVerifiedAt = new Date();
      }
      if (!user.isActive) {
        // AGENTS.md §17.2: a newly registered user is INACTIVE;
        // successful email verification activates the account.
        updates.isActive = true;
      }
      if (Object.keys(updates).length > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    });

    // Verification is the production moment a Service Provider becomes
    // eligible for a tenant. Idempotent; no-op for other account types.
    await this.organizationProvisioning.ensureForServiceProvider(token.userId);

    return { status: 'verified' };
  }

  /**
   * Queue a new verification email.
   *
   * The response is generic and identical regardless of whether the
   * email exists or is already verified, so the endpoint cannot be
   * used to enumerate registered accounts (approved plan). Any previous
   * unused verification tokens are invalidated inside
   * issueVerificationToken, so only the newest token remains usable.
   */
  async resendVerification(email: string): Promise<{ status: 'queued' }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user && !user.emailVerifiedAt) {
      await this.issueVerificationToken(user.id, user.email);
    }

    return { status: 'queued' };
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        emailVerifiedAt: true,
        // Identity fields returned to the frontend at login so it can
        // greet the user by Full Name and render the sidebar's
        // accountType-based visibility filter without an extra
        // round-trip. These are non-secret product fields; the
        // passwordHash and the verification lifecycle are NOT
        // returned (AGENTS.md §8, §17.2).
        fullName: true,
        accountType: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const passwordValid = await this.verifyPassword(
      dto.password,
      user.passwordHash ?? '',
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Unverified accounts must NOT receive a JWT, refresh token, or any
    // authenticated session (approved plan). The check runs only AFTER
    // the password is validated, so the endpoint cannot be probed by
    // callers who do not know the password.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email not verified');
    }

    // Recovery path: if verification-time provisioning failed or the
    // user was created before this service existed, provision on the
    // first successful login. Idempotent.
    await this.organizationProvisioning.ensureForServiceProvider(user.id);

    const tokens = await this.persistTokensForUser(user.id, user.email, user.accountType);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        accountType: user.accountType,
      },
    };
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(rawRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, accountType: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken || storedToken.revokedAt) {
      this.logger.warn(
        `Possible token reuse for user ${user.id}; revoking all tokens`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.persistTokensForUser(user.id, user.email, user.accountType);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.debug(`Revoked refresh token hash ${tokenHash.slice(0, 8)}`);
    }
  }
}
