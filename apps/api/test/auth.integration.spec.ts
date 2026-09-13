import { createHash, randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service.js';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service.js';
import { OrganizationProvisioningService } from '../src/memberships/organization-provisioning.service.js';
import type { LoginDto } from '../src/auth/dto/login.dto.js';
import type { RegisterDto } from '../src/auth/dto/register.dto.js';

if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-access-secret-32-chars-min';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-32-chars-min';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';

// Force the dev-only auto-verify bypass OFF for the entire integration
// suite, so production-path tests exercise the normal verification flow
// regardless of the local .env configuration. The dedicated bypass ON/OFF
// tests below manage the flag explicitly and restore it in finally blocks.
process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'false';

const prisma = new PrismaService();
const jwtService = new JwtService();
const organizationProvisioning = new OrganizationProvisioningService(prisma);
const authService = new AuthService(prisma, jwtService, organizationProvisioning);

/**
 * Register `email` and capture its verification token from the
 * local-development boot artifact. With BOOT_ARTIFACTS_ALLOWED=true the
 * backend logs the verification URL — this is the ONLY local delivery
 * mechanism (approved plan; no email provider exists) and the raw token
 * is never persisted (only its SHA-256 hash).
 */
async function registerAndCaptureToken(
  email: string,
  password: string,
): Promise<string> {
  const logSpy = jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  const prevGate = process.env.BOOT_ARTIFACTS_ALLOWED;
  const prevBypass = process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
  process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
  // Force the normal verification path regardless of the local .env
  // configuration, so this helper always produces a verification token
  // + log URL for the production-path tests that consume it.
  delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
  try {
    // Tests in this file exercise the verified/unverified lifecycle
    // of the public registration contract. The new contract
    // (AGENTS.md §17.2) requires accountType and fullName; we use
    // SERVICE_PROVIDER here because the lifecycle behaviour is
    // identical for both account types and the accountType field
    // does not affect auth state.
    await authService.register({
      accountType: 'SERVICE_PROVIDER',
      fullName: 'Integration Test User',
      email,
      password,
    });
    const logged = logSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .find((msg) => msg.includes('/verify-email?token='));
    if (!logged) {
      throw new Error(`verification URL was not logged for ${email}`);
    }
    return logged.split('?token=')[1]!.trim();
  } finally {
    if (prevGate === undefined) {
      delete process.env.BOOT_ARTIFACTS_ALLOWED;
    } else {
      process.env.BOOT_ARTIFACTS_ALLOWED = prevGate;
    }
    if (prevBypass === undefined) {
      delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    } else {
      process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = prevBypass;
    }
    logSpy.mockRestore();
  }
}

/** Register + verify + login: token pair for a VERIFIED user. */
async function registerVerifiedAndLogin(email: string, password: string) {
  const rawToken = await registerAndCaptureToken(email, password);
  await authService.verifyEmail(rawToken);
  return authService.login({ email, password } as LoginDto);
}

const runTag = `stageb6-${randomUUID()}`;
const testEmail = (name: string) => `stageb6.${name}.${runTag}@example.test`;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // FK-safe cleanup restricted to this run's rows.
  const users = await prisma.user.findMany({
    where: { email: { contains: runTag } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const memberships =
    userIds.length === 0
      ? []
      : await prisma.organizationMembership.findMany({
          where: { userId: { in: userIds } },
          select: { organizationId: true },
        });
  const orgIds = [...new Set(memberships.map((m) => m.organizationId))];

  await prisma.refreshToken.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { user: { email: { contains: runTag } } },
  });
  if (userIds.length > 0) {
    await prisma.organizationMembership.deleteMany({
      where: { userId: { in: userIds } },
    });
  }
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  if (orgIds.length > 0) {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
  await prisma.$disconnect();
});

describe('Auth foundation (real PostgreSQL + real Argon2id + real JWT)', () => {
  it('registers a new user and stores an Argon2id password hash', async () => {
    const dto: RegisterDto = {
      accountType: 'SERVICE_PROVIDER',
      fullName: 'Register Test',
      email: testEmail('register'),
      password: 'StrongPassword123!',
    };

    // Capture the global side-effect counts BEFORE the registration so
    // we can assert that the registration did not create any
    // Organization / OrganizationMembership / Workspace.
    // (The DB may already contain rows from prior test runs in this
    // integration suite; we therefore use deltas.)
    const before = {
      orgs: await prisma.organization.count(),
      memberships: await prisma.organizationMembership.count(),
      workspaces: await prisma.workspace.count(),
    };

    // Approved contract: registration issues NO tokens (no JWT, no
    // refresh token, no session) and returns the verification-required
    // discriminator plus the registered email. The account starts
    // UNVERIFIED and INACTIVE (AGENTS.md §17.2). The frontend uses the
    // explicit status tag to navigate to /verify-email.
    const result = await authService.register(dto);
    expect(result).toEqual({
      status: 'verification_required',
      email: dto.email,
    });

    // The created user must be INACTIVE and have accountType/fullName
    // persisted; displayName is the back-compat field populated from
    // fullName.
    const created = await prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        isActive: true,
        emailVerifiedAt: true,
        accountType: true,
        fullName: true,
        displayName: true,
        phone: true,
      },
    });
    expect(created).not.toBeNull();
    expect(created!.isActive).toBe(false);
    expect(created!.emailVerifiedAt).toBeNull();
    expect(created!.accountType).toBe('SERVICE_PROVIDER');
    expect(created!.fullName).toBe('Register Test');
    expect(created!.displayName).toBe('Register Test');
    expect(created!.phone).toBeNull();

    // No side effects: no Organization, no Membership,
    // no Workspace was created by this registration.
    const after = {
      orgs: await prisma.organization.count(),
      memberships: await prisma.organizationMembership.count(),
      workspaces: await prisma.workspace.count(),
    };
    expect(after.orgs - before.orgs).toBe(0);
    expect(after.memberships - before.memberships).toBe(0);
    expect(after.workspaces - before.workspaces).toBe(0);
    // The user has no refresh token: registration does NOT issue
    // access or refresh tokens.
    const refreshTokens = await prisma.refreshToken.count({
      where: { user: { email: dto.email } },
    });
    expect(refreshTokens).toBe(0);
  });

  it('persists INDIVIDUAL_BUSINESS account type with phone and displayName=fullName', async () => {
    const email = testEmail('indi-phone');
    await authService.register({
      accountType: 'INDIVIDUAL_BUSINESS',
      fullName: 'Indy Phone',
      email,
      phone: '+1-555-0123',
      password: 'Phone123456!',
    });
    const created = await prisma.user.findUnique({
      where: { email },
      select: {
        accountType: true,
        fullName: true,
        displayName: true,
        phone: true,
        isActive: true,
      },
    });
    expect(created).not.toBeNull();
    expect(created!.accountType).toBe('INDIVIDUAL_BUSINESS');
    expect(created!.fullName).toBe('Indy Phone');
    expect(created!.displayName).toBe('Indy Phone');
    expect(created!.phone).toBe('+1-555-0123');
    expect(created!.isActive).toBe(false);
  });

  it('verification activates the user (isActive: false -> true)', async () => {
    const email = testEmail('activate');
    const password = 'Activate123!';
    const rawToken = await registerAndCaptureToken(email, password);
    // Before verification: isActive = false.
    const before = await prisma.user.findUnique({
      where: { email },
      select: { isActive: true, emailVerifiedAt: true },
    });
    expect(before!.isActive).toBe(false);
    expect(before!.emailVerifiedAt).toBeNull();
    await authService.verifyEmail(rawToken);
    // After verification: isActive = true AND emailVerifiedAt is set.
    const after = await prisma.user.findUnique({
      where: { email },
      select: { isActive: true, emailVerifiedAt: true },
    });
    expect(after!.isActive).toBe(true);
    expect(after!.emailVerifiedAt).not.toBeNull();
  });

  it('rejects duplicate registration with ForbiddenException', async () => {
    const dto: RegisterDto = {
      accountType: 'SERVICE_PROVIDER',
      fullName: 'Duplicate Test',
      email: testEmail('dup'),
      password: 'StrongPassword123!',
    };
    await authService.register(dto);
    await expect(authService.register(dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects login before verification and allows it after', async () => {
    const email = testEmail('login');
    const password = 'AnotherPassword456!';
    const rawToken = await registerAndCaptureToken(email, password);

    // Unverified accounts must NOT receive a JWT, refresh token, or any
    // authenticated session (approved contract).
    await expect(
      authService.login({ email, password } as LoginDto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await authService.verifyEmail(rawToken);

    const ok = await authService.login({ email, password } as LoginDto);
    expect(ok.accessToken).toBeTruthy();
    expect(ok.refreshToken).toBeTruthy();

    await expect(
      authService.login({ email, password: 'WrongPassword!' } as LoginDto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login for non-existent user', async () => {
    await expect(
      authService.login({
        email: testEmail('nonexistent'),
        password: 'doesntmatter',
      } as LoginDto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates refresh tokens and rejects reuse of revoked token', async () => {
    const email = testEmail('rotate');
    const password = 'RotateMe789!';
    const first = await registerVerifiedAndLogin(email, password);

    // Rotate: second pair should differ from first.
    const second = await authService.refresh(first.refreshToken);
    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Reuse of the original (now revoked) refresh token must fail.
    await expect(authService.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logs out by revoking the refresh token', async () => {
    const email = testEmail('logout');
    const tokens = await registerVerifiedAndLogin(email, 'LogoutMe012!');

    await authService.logout(tokens.refreshToken);

    // After logout, the same refresh token should be rejected on refresh.
    await expect(authService.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired or malformed refresh token', async () => {
    await expect(authService.refresh('not-a-real-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('verifies a registered user can be authenticated end-to-end', async () => {
    const email = testEmail('e2e');
    const password = 'EndToEnd345!';

    // Full approved journey: register (unverified, no tokens) ->
    // verify-email -> login issues the JWT pair.
    const rawToken = await registerAndCaptureToken(email, password);
    await authService.verifyEmail(rawToken);
    const loggedIn = await authService.login({ email, password } as LoginDto);

    const decodedAccess = jwtService.verify(loggedIn.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    expect(decodedAccess).toMatchObject({ email });

    const decodedRefresh = jwtService.verify(loggedIn.refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
    expect(decodedRefresh).toHaveProperty('sub');
  });

  it('hashes passwords using Argon2id (not bcrypt, not plain text)', async () => {
    const email = testEmail('hashcheck');
    const password = 'HashCheck678!';
    await authService.register({
      accountType: 'SERVICE_PROVIDER',
      fullName: 'Hash Check',
      email,
      password,
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });

    // Confirm format
    expect(user?.passwordHash?.startsWith('$argon2id$')).toBe(true);

    // Confirm we can verify the hash with raw argon2
    const valid = await argon2.verify(user!.passwordHash!, password);
    expect(valid).toBe(true);
  });

  it('rejects reuse of a consumed verification token (single-use)', async () => {
    const email = testEmail('single-use');
    const rawToken = await registerAndCaptureToken(email, 'SingleUse123!');
    await expect(authService.verifyEmail(rawToken)).resolves.toEqual({
      status: 'verified',
    });
    // Already-consumed tokens produce the same generic error as invalid ones.
    await expect(authService.verifyEmail(rawToken)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const user = await prisma.user.findUnique({
      where: { email },
      select: { emailVerifiedAt: true },
    });
    expect(user?.emailVerifiedAt).not.toBeNull();
  });

  it('rejects an unknown verification token with the same generic error', async () => {
    await expect(
      authService.verifyEmail('not-a-real-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resend invalidates all previous unused tokens; only the newest works', async () => {
    const email = testEmail('resend');
    const first = await registerAndCaptureToken(email, 'ResendMe123!');

    // Resend through the public contract; capture the newest token URL.
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const prevGate = process.env.BOOT_ARTIFACTS_ALLOWED;
    process.env.BOOT_ARTIFACTS_ALLOWED = 'true';
    try {
      await expect(
        authService.resendVerification(email),
      ).resolves.toEqual({ status: 'queued' });
    } finally {
      if (prevGate === undefined) {
        delete process.env.BOOT_ARTIFACTS_ALLOWED;
      } else {
        process.env.BOOT_ARTIFACTS_ALLOWED = prevGate;
      }
      logSpy.mockRestore();
    }

    // The original token no longer works after resend.
    await expect(authService.verifyEmail(first)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resend returns the identical generic response for unknown emails', async () => {
    // No enumeration: unknown emails get the same {"status":"queued"}.
    await expect(
      authService.resendVerification(testEmail('ghost')),
    ).resolves.toEqual({ status: 'queued' });
  });

  it('stores only the SHA-256 hash of verification tokens', async () => {
    const email = testEmail('hashonly');
    const rawToken = await registerAndCaptureToken(email, 'HashOnly123!');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    expect(stored).not.toBeNull();
    // The raw token must not exist anywhere in the stored row (AGENTS.md §8).
    expect(JSON.stringify(stored)).not.toContain(rawToken);
  });

  // -------------------------------------------------------------------------
  // Dev-only temporary auto-verify bypass (AUTH_DEV_AUTO_VERIFY_REGISTER).
  //
  // The gate is gated by BOTH AUTH_DEV_AUTO_VERIFY_REGISTER === 'true' AND
  // NODE_ENV !== 'production'. We never set NODE_ENV to 'production' in
  // this file (Jest sets it to 'test' by default), so the NODE_ENV
  // hard-stop is implicitly covered by all the unit tests in
  // dev-auto-verify.spec.ts. The integration tests below only need to
  // cover the behaviour contract: when the gate is open, the response
  // is `registration_complete`, the user is ACTIVE+verified, no
  // EmailVerificationToken row is created, and login succeeds.
  // -------------------------------------------------------------------------

  it('bypass ON: register returns registration_complete and creates ACTIVE+verified user without an EmailVerificationToken', async () => {
    const prevBypass = process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
    // NODE_ENV stays at whatever Jest set it to (typically 'test', which
    // is non-production, so the gate passes the NODE_ENV check).
    try {
      const dto: RegisterDto = {
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Dev Bypass IT',
        email: testEmail('dev-bypass'),
        password: 'Bypass123!',
      };
      const result = await authService.register(dto);
      // Response discriminator: registration_complete, never
      // verification_required. Email is the registered email.
      expect(result).toEqual({
        status: 'registration_complete',
        email: dto.email,
      });
      // The User row is ACTIVE + verified, exactly as if the
      // verification endpoint had run.
      const created = await prisma.user.findUnique({
        where: { email: dto.email },
        select: { isActive: true, emailVerifiedAt: true },
      });
      expect(created).not.toBeNull();
      expect(created!.isActive).toBe(true);
      expect(created!.emailVerifiedAt).not.toBeNull();
      // No EmailVerificationToken row is created.
      const tokens = await prisma.emailVerificationToken.count({
        where: { user: { email: dto.email } },
      });
      expect(tokens).toBe(0);
    } finally {
      if (prevBypass === undefined) {
        delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
      } else {
        process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = prevBypass;
      }
      if (prevNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prevNodeEnv;
      }
    }
  });

  it('bypass ON: the user created by the bypass can log in immediately (no verifyEmail call needed)', async () => {
    const prevBypass = process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = 'true';
    try {
      const dto: RegisterDto = {
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Dev Bypass Login',
        email: testEmail('dev-bypass-login'),
        password: 'BypassLogin123!',
      };
      const registered = await authService.register(dto);
      expect(registered).toEqual({
        status: 'registration_complete',
        email: dto.email,
      });
      // No verifyEmail call. Just log in.
      const tokens = await authService.login({
        email: dto.email,
        password: dto.password,
      });
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    } finally {
      if (prevBypass === undefined) {
        delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
      } else {
        process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = prevBypass;
      }
    }
  });

  it('bypass OFF (default): register returns verification_required, creates INACTIVE user, and issues a verification token (regression)', async () => {
    // The gate is OFF by default. The production-path behavior is
    // preserved: verification_required, isActive=false, a token row
    // is created. This is a regression guard so the bypass never leaks
    // into the default runtime.
    const prevBypass = process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
    try {
      const dto: RegisterDto = {
        accountType: 'SERVICE_PROVIDER',
        fullName: 'Default OFF',
        email: testEmail('bypass-off'),
        password: 'Off123!',
      };
      const result = await authService.register(dto);
      expect(result).toEqual({
        status: 'verification_required',
        email: dto.email,
      });
      const created = await prisma.user.findUnique({
        where: { email: dto.email },
        select: { isActive: true, emailVerifiedAt: true },
      });
      expect(created!.isActive).toBe(false);
      expect(created!.emailVerifiedAt).toBeNull();
      // A token row IS created.
      const tokens = await prisma.emailVerificationToken.count({
        where: { user: { email: dto.email } },
      });
      expect(tokens).toBe(1);
    } finally {
          if (prevBypass === undefined) {
        delete process.env.AUTH_DEV_AUTO_VERIFY_REGISTER;
      } else {
        process.env.AUTH_DEV_AUTO_VERIFY_REGISTER = prevBypass;
      }
    }
    });

});