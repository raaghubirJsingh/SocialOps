import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthService, type TokenPair } from './auth.service.js';

const JWT_ACCESS_SECRET = 'test-access-secret-32-chars-minimum';
const JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-minimum';

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    user: { create: vi.fn(), findUnique: vi.fn() },
    refreshToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    ...overrides,
  } as unknown as ConstructorParameters<typeof AuthService>[0];
}

function makeJwtMock() {
  return {
    sign: vi.fn((payload: object) => `mock-token-${JSON.stringify(payload)}`),
    verify: vi.fn((token: string) => {
      if (token === 'expired-token') throw new Error('jwt expired');
      return { sub: 'user-123' };
    }),
  } as unknown as JwtService;
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  process.env.JWT_ACCESS_SECRET = JWT_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  const prisma = makePrismaMock(prismaOverrides);
  const jwt = makeJwtMock();
  return { service: new AuthService(prisma, jwt), prisma, jwt };
}

describe('AuthService', () => {
  describe('login', () => {
    it('returns token pair for valid credentials', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1', email: 'user@example.com', passwordHash: hash, isActive: true,
      });
      const result: TokenPair = await service.login({
        email: 'user@example.com', password: 'Password123!',
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('throws UnauthorizedException for unknown user', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException for deactivated user', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1', email: 'inactive@example.com', passwordHash: 'x', isActive: false,
      });
      await expect(
        service.login({ email: 'inactive@example.com', password: 'pass' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Correct!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1', email: 'user@example.com', passwordHash: hash, isActive: true,
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'Wrong!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rejects expired tokens', async () => {
      const { service } = makeService();
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates a valid refresh token', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-123', email: 'user@example.com', isActive: true,
      });
      (prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'rt-1', userId: 'user-123', tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), revokedAt: null, createdAt: new Date(),
      });
      (prisma.refreshToken.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rt-1', revokedAt: new Date() });
      const result = await service.refresh('valid-token');
      expect(result.accessToken).toBeTruthy();
      expect(prisma.refreshToken.update).toHaveBeenCalled();
    });

    it('revokes all tokens on reuse of revoked token', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-123', email: 'user@example.com', isActive: true,
      });
      (prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'rt-1', userId: 'user-123', tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(), createdAt: new Date(),
      });
      (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      await expect(service.refresh('valid-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes a refresh token', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      await service.logout('some-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('is a no-op when no token matches', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      await expect(service.logout('no-match')).resolves.toBeUndefined();
    });
  });
});
