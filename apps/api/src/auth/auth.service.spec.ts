import {
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthService, type TokenPair } from './auth.service.js';
import type { OrganizationProvisioningService } from '../memberships/organization-provisioning.service.js';
import { registerSchema } from './dto/register.dto.js';
import { jest } from '@jest/globals';

const JWT_ACCESS_SECRET = 'test-access-secret-32-chars-minimum';
const JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-minimum';

function makePrismaMock(overrides: Record<string, unknown> = {}) {
    const prisma = {
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
  // Interactive transactions execute the callback against the same mock,
  // so service code written as `prisma.$transaction(async (tx) => ...)`
  // resolves every `tx.*` call against the mocked delegates above.
  (prisma.$transaction as ReturnType<typeof jest.fn>).mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(prisma),
  );
  return prisma as unknown as ConstructorParameters<typeof AuthService>[0];
}

function makeJwtMock() {
  return {
    sign: jest.fn((payload: object) => `mock-token-${JSON.stringify(payload)}`),
    verify: jest.fn((token: string) => {
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
  process.env.BOOT_ARTIFACTS_ALLOWED = 'false';
  // The dev-only auto-verify gate is OFF by default for every test
  // unless the test flips it. The gate has a separate NODE_ENV
  // hard-stop, so we also leave NODE_ENV at whatever Jest set it to
  // (typically 'test', which is non-production and therefore the
  // gate would still pass the NODE_ENV check if AUTH_DEV_AUTO_VERIFY_REGISTER
  // were enabled).
  delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
  const prisma = makePrismaMock(prismaOverrides);
  const jwt = makeJwtMock();
  const provisioning = {
    ensureForServiceProvider: jest.fn(async () => undefined),
  };
  return {
    service: new AuthService(
      prisma,
      jwt,
      provisioning as unknown as OrganizationProvisioningService,
    ),
    prisma,
    jwt,
    provisioning,
  };
}

describe('AuthService', () => {
  describe('login', () => {
    it('returns token pair and user identity for valid credentials', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
        // Employee Module V1: the login query selects the 1:1
        // employeeProfile relation in the SAME read, so a
        // non-employee SERVICE_PROVIDER row resolves it to null.
        employeeProfile: null,
      });
      const result = await service.login({
        email: 'user@example.com', password: 'Password123!',
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      // The login response carries the user's identity so the
      // frontend can greet by Full Name and filter the sidebar by
      // accountType without an extra round-trip (AGENTS.md §17).
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
        // Derived from employeeProfile === null (Employee Module V1).
        isEmployee: false,
      });
    });

    it('reports isEmployee true when an EmployeeProfile row exists', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      // Employee Module V1: an employee logs in with accountType NULL
      // (AccountType intentionally has no EMPLOYEE value — AGENTS.md
      // §17.1); the EmployeeProfile relation is the discriminator.
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'emp-1',
        email: 'employee@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
        fullName: 'Employee One',
        accountType: null,
        employeeProfile: { userId: 'emp-1' },
      });
      const result = await service.login({
        email: 'employee@example.com', password: 'Password123!',
      });
      // UI routing hint ONLY — EmployeeContextGuard remains the
      // server-side authority, re-verified per request.
      expect(result.user.isEmployee).toBe(true);
      expect(result.user.accountType).toBeNull();
    });

    it('returns null fullName/accountType for a pre-migration user row', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      // Pre-migration rows have null fullName and null accountType.
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'legacy@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
        fullName: null,
        accountType: null,
      });
      const result = await service.login({
        email: 'legacy@example.com', password: 'Password123!',
      });
      expect(result.user.fullName).toBeNull();
      expect(result.user.accountType).toBeNull();
    });

    it('does not leak passwordHash in the login response', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
      });
      const result = await service.login({
        email: 'user@example.com', password: 'Password123!',
      });
      // The new response shape must NOT carry the Argon2id hash or any
      // other server-managed field (AGENTS.md §8).
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('isActive');
      expect(result.user).not.toHaveProperty('emailVerifiedAt');
    });

    it('rejects login for an unverified (emailVerifiedAt null) user', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Password123!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: null,
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
      });
      // Unverified accounts must NOT receive a JWT, refresh token, or
      // any authenticated session (approved plan).
      await expect(
        service.login({ email: 'user@example.com', password: 'Password123!' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for unknown user', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(null);
      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException for deactivated user', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'inactive@example.com',
        passwordHash: 'x',
        isActive: false,
        fullName: 'Inactive User',
        accountType: 'SERVICE_PROVIDER',
      });
      await expect(
        service.login({ email: 'inactive@example.com', password: 'pass' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const { service, prisma } = makeService();
      const argon2 = await import('argon2');
      const hash = await argon2.hash('Correct!', { type: argon2.argon2id });
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'Wrong!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('creates an unverified INACTIVE user and issues NO tokens (production path)', async () => {
      // Default gate is OFF (AUTH_DEV_AUTO_VERIFY_REGISTER unset).
      // The create call must persist isActive=false and
      // emailVerifiedAt=null, and issueVerificationToken must run.
      const { service, prisma, provisioning } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'new@example.com',
      });
      const result = await service.register({
        accountType: 'SERVICE_PROVIDER',
        fullName: 'New User',
        email: 'new@example.com',
        password: 'Password123!',
      });
      // The production path returns the verification-required branch.
      // No JWT, access token, refresh token, or session is ever
      // created here. AGENTS.md §17.2.
      expect(result).toEqual({
        status: 'verification_required',
        email: 'new@example.com',
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);

      const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.isActive).toBe(false);
      expect(createArg.data.emailVerifiedAt).toBeNull();
      expect(createArg.data.accountType).toBe('SERVICE_PROVIDER');
      expect(createArg.data.fullName).toBe('New User');
      expect(createArg.data.displayName).toBe('New User');
      // Production registration must not provision a tenant (AGENTS.md §17.2).
      expect(provisioning.ensureForServiceProvider).not.toHaveBeenCalled();
    });

    it('bypass ON: creates ACTIVE + verified user, does not issue an EmailVerificationToken, returns registration_complete', async () => {
      // The gate is open. The new user must be created ACTIVE with
      // emailVerifiedAt populated, no EmailVerificationToken must be
      // inserted, and the response must be registration_complete.
      // NOTE: `makeService` is a per-test factory; the env var must
      // be set AFTER `makeService()` runs, because `makeService` clears
      // the env var as part of its per-test setup.
      const { service, prisma, provisioning } = makeService();
      process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'dev-bypass@example.com',
      });

      const result = await service.register({
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Dev Bypass',
        email: 'dev-bypass@example.com',
        password: 'Password123!',
      });

      // Response: registration_complete, never verification_required.
      expect(result).toEqual({
        status: 'registration_complete',
        email: 'dev-bypass@example.com',
      });

      // Persisted User row: isActive=true, emailVerifiedAt populated.
      const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.isActive).toBe(true);
      expect(createArg.data.emailVerifiedAt).toBeInstanceOf(Date);

      // No EmailVerificationToken row is created. The issue call must
      // not have run.
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(provisioning.ensureForServiceProvider).toHaveBeenCalledWith('user-1');

      // Cleanup: turn the gate off so subsequent tests see the
      // production default.
      delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    });

    it('bypass ON: still rejects duplicate emails with ForbiddenException', async () => {
      const { service, prisma } = makeService();
      process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
      // The service uses `instanceof Prisma.PrismaClientKnownRequestError`
      // to detect the duplicate-email branch. Use a real instance of
      // the class so the check succeeds.
      (prisma.user.create as ReturnType<typeof jest.fn>).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          { code: 'P2002', clientVersion: 'test' },
        ),
      );

      try {
        await expect(
          service.register({
            accountType: 'SERVICE_PROVIDER',
            fullName: 'Dupe',
            email: 'dupe@example.com',
            password: 'Password123!',
          }),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
      }
    });

    it('NODE_ENV=production + AUTH_DEV_AUTO_VERIFY_REGISTER=true => hard-stop, behaves as production', async () => {
      // Even if a deployment system accidentally sets the dev flag in
      // production, the gate must remain closed. The branch returns
      // verification_required and a verification token IS issued.
      const { service, prisma } = makeService();
      // Apply overrides AFTER makeService (which clears the env vars).
      process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
      process.env.NODE_ENV = 'production';
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'prod-hardstop@example.com',
      });

      try {
        const result = await service.register({
          accountType: 'SERVICE_PROVIDER',
          fullName: 'Prod Hardstop',
          email: 'prod-hardstop@example.com',
          password: 'Password123!',
        });
        expect(result).toEqual({
          status: 'verification_required',
          email: 'prod-hardstop@example.com',
        });
        const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
          .calls[0][0] as { data: Record<string, unknown> };
        expect(createArg.data.isActive).toBe(false);
        expect(createArg.data.emailVerifiedAt).toBeNull();
        expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      } finally {
        delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
        delete process.env.NODE_ENV;
      }
    });

    it('unrelated string variants of the gate env do not enable the bypass', async () => {
      // The gate is a strict string match. Anything that is not the
      // exact 'true' literal must not enable the bypass. This guards
      // against loose env-var parsers.
      const variants = ['TRUE', '1', 'yes', ' true', 'true '];
      for (const v of variants) {
        const { service, prisma } = makeService();
        process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = v;
        (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
          id: 'user-1', email: 'v@example.com',
        });
        const result = await service.register({
          accountType: 'SERVICE_PROVIDER',
          fullName: 'Variant',
          email: 'v@example.com',
          password: 'Password123!',
        });
        expect(result).toEqual({
          status: 'verification_required',
          email: 'v@example.com',
        });
      }
      delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    });

    it('persists INDIVIDUAL_BUSINESS account type', async () => {
      const { service, prisma } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'indi@example.com',
      });
      await service.register({
        accountType: 'INDIVIDUAL_BUSINESS',
        fullName: 'Indy User',
        email: 'indi@example.com',
        password: 'Password123!',
      });
      const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.accountType).toBe('INDIVIDUAL_BUSINESS');
    });

    it('persists optional phone when supplied', async () => {
      const { service, prisma } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'ph@example.com',
      });
      await service.register({
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Phone User',
        email: 'ph@example.com',
        phone: '+1-555-0100',
        password: 'Password123!',
      });
      const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.phone).toBe('+1-555-0100');
    });

    it('persists null phone when omitted', async () => {
      const { service, prisma } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'nophone@example.com',
      });
      await service.register({
        accountType: 'INDIVIDUAL_BUSINESS',
        fullName: 'No Phone',
        email: 'nophone@example.com',
        password: 'Password123!',
      });
      const createArg = (prisma.user.create as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.phone).toBeNull();
    });

    it('Zod layer rejects invalid accountType', () => {
      // The controller passes the DTO through `ZodValidationPipe`, but
      // we also exercise the Zod schema directly here as a guard.
      const result = registerSchema.safeParse({
        accountType: 'ADMIN',
        fullName: 'Bad',
        email: 'bad@example.com',
        password: 'Password123!',
      });
      expect(result.success).toBe(false);
    });

    it('Zod layer rejects missing fullName', () => {
      const result = registerSchema.safeParse({
        accountType: 'SERVICE_PROVIDER',
        email: 'noname@example.com',
        password: 'Password123!',
      });
      expect(result.success).toBe(false);
    });

    it('persists only the SHA-256 hash of a 24h single-use verification token', async () => {
      const { service, prisma } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'new@example.com',
      });
      await service.register({
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Token Hash Test',
        email: 'new@example.com',
        password: 'Password123!',
      });
      // All previous unused tokens are invalidated before the new one.
      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      const createMock = prisma.emailVerificationToken.create as ReturnType<typeof jest.fn>;
      const createArg = createMock.mock.calls[0][0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };
      expect(createArg.data.userId).toBe('user-1');
      // Only the hash is stored: 64 hex chars = SHA-256; no raw token.
      expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArg.data).not.toHaveProperty('rawToken');
      const ttl = createArg.data.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(24 * 60 * 60 * 1000 - 60_000);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('logs the verification URL only when BOOT_ARTIFACTS_ALLOWED=true', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const { service, prisma } = makeService();
      // The gate is read at call time, so it is enabled AFTER makeService
      // (which resets the environment for every test).
      process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
      process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
      try {
        (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
          id: 'user-1', email: 'new@example.com',
        });
        await service.register({
          accountType: 'SERVICE_PROVIDER',
          fullName: 'New User',
          email: 'new@example.com',
          password: 'Password123!',
        });
        const logged = (logSpy.mock.calls as unknown as string[][])
          .map((args) => args.join(' '))
          .find((msg) => msg.includes('/verify-email?token='));
        expect(logged).toBeDefined();
      } finally {
        process.env.BOOT_ARTIFACTS_ALLOWED = 'false';
        logSpy.mockRestore();
      }
    });

    it('does not log the verification URL when the gate is disabled', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const { service, prisma } = makeService();
      (prisma.user.create as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1', email: 'new@example.com',
      });
      await service.register({
        accountType: 'SERVICE_PROVIDER',
        fullName: 'New User',
        email: 'new@example.com',
        password: 'Password123!',
      });
      const logged = (logSpy.mock.calls as unknown as string[][])
        .map((args) => args.join(' '))
        .find((msg) => msg.includes('/verify-email?token='));
      expect(logged).toBeUndefined();
      logSpy.mockRestore();
    });
    });

  describe('verifyEmail', () => {
    const rawToken = 'raw-verification-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    function mockToken(overrides: Record<string, unknown> = {}) {
      return {
        id: 'evt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: null,
        ...overrides,
      };
    }

    it('verifies a valid token, sets emailVerifiedAt, and activates the user', async () => {
      const { service, prisma, provisioning } = makeService();
      (prisma.emailVerificationToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(mockToken());
      (prisma.emailVerificationToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 1 });
      // Newly registered users are INACTIVE (AGENTS.md §17.2).
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: null,
        isActive: false,
      });
      const result = await service.verifyEmail(rawToken);
      expect(result).toEqual({ status: 'verified' });
      expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash } });
      // Both fields are updated in a single write inside the transaction.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date), isActive: true },
      });
      expect(provisioning.ensureForServiceProvider).toHaveBeenCalledWith('user-1');
    });

    it('uses one generic error for unknown, expired, used, and lost-race tokens', async () => {
      const cases = [
        { find: null },
        { find: mockToken({ usedAt: new Date() }) },
        { find: mockToken({ expiresAt: new Date(Date.now() - 1000) }) },
        { find: mockToken(), claim: { count: 0 } },
      ];
      for (const testCase of cases) {
        const { service, prisma } = makeService();
        (prisma.emailVerificationToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(testCase.find);
        (prisma.emailVerificationToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue(testCase.claim ?? { count: 1 });
        (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
          id: 'user-1',
          emailVerifiedAt: null,
          isActive: false,
        });
        // Invalid, expired, and already-used tokens all produce the SAME
        // generic error - no information about which condition occurred.
        await expect(service.verifyEmail(rawToken)).rejects.toThrow(BadRequestException);
        expect(prisma.user.update).not.toHaveBeenCalled();
      }
    });

    it('keeps the original emailVerifiedAt when the account is already verified', async () => {
      const { service, prisma } = makeService();
      const verifiedAt = new Date('2026-01-01T00:00:00Z');
      (prisma.emailVerificationToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(mockToken());
      (prisma.emailVerificationToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 1 });
      // Already verified + already active: neither timestamp nor isActive
      // is touched on a re-verification.
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: verifiedAt,
        isActive: true,
      });
      await expect(service.verifyEmail(rawToken)).resolves.toEqual({ status: 'verified' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('activates an INACTIVE user but does not move an existing emailVerifiedAt', async () => {
      const { service, prisma } = makeService();
      const verifiedAt = new Date('2026-01-01T00:00:00Z');
      (prisma.emailVerificationToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(mockToken());
      (prisma.emailVerificationToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 1 });
      // Edge case: emailVerifiedAt is already set but isActive is false
      // (e.g. an admin deactivated the user). We must NOT touch the
      // existing emailVerifiedAt; we DO flip isActive back to true.
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: verifiedAt,
        isActive: false,
      });
      await expect(service.verifyEmail(rawToken)).resolves.toEqual({ status: 'verified' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: true },
      });
    });
  });

  describe('resendVerification', () => {
    it('invalidates previous tokens and issues a new one for an unverified user', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({ id: 'user-1', email: 'user@example.com', emailVerifiedAt: null });
      const result = await service.resendVerification('user@example.com');
      expect(result).toEqual({ status: 'queued' });
      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
    });

    it('returns the identical generic response for unknown and verified emails', async () => {
      const { service: unknownService, prisma: unknownPrisma } = makeService();
      (unknownPrisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue(null);
      await expect(unknownService.resendVerification('ghost@example.com')).resolves.toEqual({ status: 'queued' });
      expect(unknownPrisma.emailVerificationToken.create).not.toHaveBeenCalled();

      const { service: verifiedService, prisma: verifiedPrisma } = makeService();
      (verifiedPrisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({ id: 'user-2', email: 'v@example.com', emailVerifiedAt: new Date() });
      await expect(verifiedService.resendVerification('v@example.com')).resolves.toEqual({ status: 'queued' });
      expect(verifiedPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects expired tokens', async () => {
      const { service } = makeService();
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates a valid refresh token', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-123', email: 'user@example.com', isActive: true,
      });
      (prisma.refreshToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'rt-1', userId: 'user-123', tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), revokedAt: null, createdAt: new Date(),
      });
      (prisma.refreshToken.update as ReturnType<typeof jest.fn>).mockResolvedValue({ id: 'rt-1', revokedAt: new Date() });
      const result = await service.refresh('valid-token');
      expect(result.accessToken).toBeTruthy();
      expect(prisma.refreshToken.update).toHaveBeenCalled();
    });

    it('revokes all tokens on reuse of revoked token', async () => {
      const { service, prisma } = makeService();
      (prisma.user.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'user-123', email: 'user@example.com', isActive: true,
      });
      (prisma.refreshToken.findUnique as ReturnType<typeof jest.fn>).mockResolvedValue({
        id: 'rt-1', userId: 'user-123', tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(), createdAt: new Date(),
      });
      (prisma.refreshToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 1 });
      await expect(service.refresh('valid-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes a refresh token', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 1 });
      await service.logout('some-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('is a no-op when no token matches', async () => {
      const { service, prisma } = makeService();
      (prisma.refreshToken.updateMany as ReturnType<typeof jest.fn>).mockResolvedValue({ count: 0 });
      await expect(service.logout('no-match')).resolves.toBeUndefined();
    });
  });
});
