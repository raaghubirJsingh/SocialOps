import { randomUUID } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service.js';
import type { LoginDto } from '../src/auth/dto/login.dto.js';
import type { RegisterDto } from '../src/auth/dto/register.dto.js';

if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-access-secret-32-chars-min';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-32-chars-min';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';

const prisma = new PrismaClient();
const jwtService = new JwtService();
const authService = new AuthService(prisma, jwtService);

const runTag = `stageb6-${randomUUID()}`;
const testEmail = (name: string) => `stageb6.${name}.${runTag}@example.test`;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // FK-safe cleanup restricted to this run's rows.
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: runTag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: runTag } } });
  await prisma.$disconnect();
});

describe('Auth foundation (real PostgreSQL + real Argon2id + real JWT)', () => {
  it('registers a new user and stores an Argon2id password hash', async () => {
    const dto: RegisterDto = {
      email: testEmail('register'),
      password: 'StrongPassword123!',
      displayName: 'Register Test',
    };

    const tokens = await authService.register(dto);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    // Verify the password is actually stored as an Argon2id hash, not plain text.
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
      select: { passwordHash: true },
    });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(dto.password);
  });

  it('rejects duplicate registration with ForbiddenException', async () => {
    const dto: RegisterDto = {
      email: testEmail('dup'),
      password: 'StrongPassword123!',
    };
    await authService.register(dto);
    await expect(authService.register(dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs in with correct password and rejects wrong password', async () => {
    const email = testEmail('login');
    const password = 'AnotherPassword456!';
    await authService.register({ email, password });

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
    const dto: RegisterDto = {
      email: testEmail('rotate'),
      password: 'RotateMe789!',
    };
    const first = await authService.register(dto);

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
    const dto: RegisterDto = {
      email: testEmail('logout'),
      password: 'LogoutMe012!',
    };
    const tokens = await authService.register(dto);

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

    const registered = await authService.register({ email, password });
    const decodedAccess = jwtService.verify(registered.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    expect(decodedAccess).toMatchObject({ email });

    const loggedIn = await authService.login({ email, password } as LoginDto);
    const decodedRefresh = jwtService.verify(loggedIn.refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
    expect(decodedRefresh).toHaveProperty('sub');
  });

  it('hashes passwords using Argon2id (not bcrypt, not plain text)', async () => {
    const email = testEmail('hashcheck');
    const password = 'HashCheck678!';
    await authService.register({ email, password });

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
});
