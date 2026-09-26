import * as argon2 from 'argon2';

import type { AccountType, PrismaClient } from '@prisma/client';

/**
 * Test-only active-user factory (Registration Phase v1.0 test support).
 *
 * The legacy public register flow is retired (L11), so integration
 * suites that only need an EXISTING active+verified user (not the
 * registration lifecycle itself) create one directly through Prisma.
 * This is a test fixture helper - it is NOT reachable from any route.
 * The user gets an Argon2id hash of a known password so the normal
 * `AuthService.login` path works unchanged.
 */
export const FACTORY_DEFAULT_PASSWORD = 'StrongPassword123!';

export interface ActiveUserFactoryInput {
  email: string;
  fullName: string;
  accountType: AccountType | null;
  phone?: string;
  password?: string;
}

export async function createActiveUser(
  prisma: PrismaClient,
  input: ActiveUserFactoryInput,
) {
  const passwordHash = await argon2.hash(
    input.password ?? FACTORY_DEFAULT_PASSWORD,
    { type: argon2.argon2id, memoryCost: 2 ** 16, timeCost: 3, parallelism: 2 },
  );
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.fullName,
      fullName: input.fullName,
      phone: input.phone ?? null,
      accountType: input.accountType,
      isActive: true,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: input.phone ? new Date() : null,
    },
  });
}
