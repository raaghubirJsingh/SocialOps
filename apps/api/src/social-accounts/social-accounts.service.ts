import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSocialAccountDto } from './dto/create-social-account.dto.js';
import type { ListSocialAccountsQuery } from './dto/list-social-accounts.dto.js';
import type { UpdateSocialAccountDto } from './dto/update-social-account.dto.js';

/**
 * Response allowlist for every SocialAccount read.
 *
 * Centralising the selection keeps the wire contract stable: the model stores
 * METADATA ONLY (no token, secret, or password column exists), and a future
 * credential phase must introduce a separate 1:1 table
 * (`SocialAccountCredential`) rather than widening this selection. The
 * colocated spec asserts this allowlist contains no token/secret-shaped key.
 */
export const SOCIAL_ACCOUNT_SELECT = {
  id: true,
  clientId: true,
  platform: true,
  platformAccountId: true,
  handle: true,
  displayName: true,
  profileUrl: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * SocialAccount metadata domain service (Client Operations V1).
 *
 * Every method is scoped by a `clientId` that the caller obtained from a
 * verified guard context (ClientAccessGuard binding or the ACTIVE Agency
 * relationship) - never from a request body or header alone. A miss is a
 * uniform 404 so an out-of-scope account is indistinguishable from a
 * non-existent one (AGENTS.md sections 6-8).
 *
 * This service performs NO platform API calls and stores NO credentials.
 */
@Injectable()
export class SocialAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  listForClient(clientId: string, filters: ListSocialAccountsQuery) {
    return this.prisma.socialAccount.findMany({
      where: {
        clientId,
        ...(filters.platform ? { platform: filters.platform } : {}),
        ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
      },
      select: SOCIAL_ACCOUNT_SELECT,
      orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
      take: filters.take,
    });
  }

  /** Tenant-scoped single read: uniform 404 when missing or out of scope. */
  async findOneForClient(clientId: string, socialAccountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, clientId },
      select: SOCIAL_ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Social account not found');
    return account;
  }

  async create(
    clientId: string,
    actorUserId: string,
    dto: CreateSocialAccountDto,
  ) {
    try {
      return await this.prisma.socialAccount.create({
        data: {
          clientId,
          platform: dto.platform,
          platformAccountId: dto.platformAccountId ?? null,
          handle: dto.handle ?? null,
          displayName: dto.displayName ?? null,
          profileUrl: dto.profileUrl ?? null,
          isActive: dto.isActive ?? true,
          createdByUserId: actorUserId,
        },
        select: SOCIAL_ACCOUNT_SELECT,
      });
    } catch (error) {
      throwIfDuplicatePlatformAccount(error);
      throw error;
    }
  }

  async update(
    clientId: string,
    socialAccountId: string,
    dto: UpdateSocialAccountDto,
  ) {
    // Scope check first: the scoped read IS the authorization gate. Only after
    // it passes may the row be updated by its unique id.
    await this.findOneForClient(clientId, socialAccountId);

    try {
      return await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        // `dto` is a `.strict()` metadata payload: an undefined entry means
        // "leave unchanged" (Prisma ignores undefined), and `null` clears the
        // optional field.
        data: { ...dto },
        select: SOCIAL_ACCOUNT_SELECT,
      });
    } catch (error) {
      throwIfDuplicatePlatformAccount(error);
      throw error;
    }
  }
}

/**
 * Maps the `@@unique([clientId, platform, platformAccountId])` violation to a
 * deterministic 409 instead of a raw 500. NULL identifiers are exempt by
 * Postgres semantics (NULLs are distinct), which is intended: several
 * not-yet-identified accounts of the same platform may coexist.
 */
function throwIfDuplicatePlatformAccount(error: unknown): void {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException({
      code: 'DUPLICATE_SOCIAL_ACCOUNT',
      message: 'This platform account is already registered for this client',
    });
  }
}