import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtAccessPayload, JwtRefreshPayload } from './types/jwt-payload.type.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  private generateTokenPair(userId: string, email: string): TokenPair {
    const accessPayload: JwtAccessPayload = { sub: userId, email };
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

  private async persistTokensForUser(userId: string, email: string): Promise<TokenPair> {
    const tokens = this.generateTokenPair(userId, email);
    await this.persistRefreshToken(userId, tokens.refreshToken);
    return tokens;
  }

  async register(dto: RegisterDto): Promise<TokenPair> {
    const passwordHash = await this.hashPassword(dto.password);

    let user: { id: string; email: string };
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
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

    return this.persistTokensForUser(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, passwordHash: true, isActive: true },
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

    return this.persistTokensForUser(user.id, user.email);
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
      select: { id: true, email: true, isActive: true },
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

    return this.persistTokensForUser(user.id, user.email);
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
