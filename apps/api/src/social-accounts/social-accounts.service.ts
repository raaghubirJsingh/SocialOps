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
 * LIST-ONLY projection: the metadata allowlist plus the derived
 * `hasCredential` signal.
 *
 * The 1:1 credential row is fetched as an EXISTENCE PROBE ONLY - just its id -
 * and the relation is stripped by `toSocialAccountDto` before the response
 * leaves the service. No ciphertext, scope, expiry, or key-version field is
 * ever selected here, so nothing about the credential can leak; the client
 * learns only WHETHER one exists.
 *
 * This stays separate from SOCIAL_ACCOUNT_SELECT on purpose: single reads and
 * create/update returns keep the pure metadata shape, and the colocated DTO
 * spec continues to assert that allowlist is secret-free.
 */
export const SOCIAL_ACCOUNT_LIST_SELECT = {
  ...SOCIAL_ACCOUNT_SELECT,
  credential: { select: { id: true } },
} as const;

type CredentialProbe = { credential: { id: string } | null };

/**
 * Strip the credential relation and expose only the boolean the UI needs to
 * choose between "Connect" and "Reconnect". The relation never reaches the wire.
 */
function toSocialAccountDto<T extends Record<string, unknown>>(
  row: T & CredentialProbe,
): Omit<T, 'credential'> & { hasCredential: boolean } {
  const { credential, ...metadata } = row;
  return { ...metadata, hasCredential: credential !== null };
}

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

  /**
   * List with the derived `hasCredential` flag. The credential relation is
   * probed for existence only and stripped before returning.
   */
  async listForClient(clientId: string, filters: ListSocialAccountsQuery) {
    const rows = await this.prisma.socialAccount.findMany({
      where: {
        clientId,
        ...(filters.platform ? { platform: filters.platform } : {}),
        ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
      },
      select: SOCIAL_ACCOUNT_LIST_SELECT,
      orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
      take: filters.take,
    });
    return rows.map(toSocialAccountDto);
  }

  /** Tenant-scoped single read: uniform 404 when missing or out of scope. */
  async findOneForClient(clientId: string, socialAccountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, clientId },
      select: SOCIAL_ACCOUNT_LIST_SELECT,
    });
    if (!account) throw new NotFoundException('Social account not found');
    return toSocialAccountDto(account);
  }

  async create(
    clientId: string,
    actorUserId: string,
    dto: CreateSocialAccountDto,
  ) {
    try {
      const created = await this.prisma.socialAccount.create({
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
        select: SOCIAL_ACCOUNT_LIST_SELECT,
      });
      // A brand-new metadata row has no credential yet.
      return toSocialAccountDto(created);
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
      const updated = await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        // `dto` is a `.strict()` metadata payload: an undefined entry means
        // "leave unchanged" (Prisma ignores undefined), and `null` clears the
        // optional field.
        data: { ...dto },
        select: SOCIAL_ACCOUNT_LIST_SELECT,
      });
      return toSocialAccountDto(updated);
    } catch (error) {
      throwIfDuplicatePlatformAccount(error);
      throw error;
    }
  }

  /**
   * Disconnect a social account: remove ONLY the 1:1 credential row.
   *
   * The parent SocialAccount METADATA row is deliberately preserved - a client
   * keeps its record of which platforms it operates after the live connection
   * is removed, and the row simply reports `hasCredential: false` afterwards.
   * The SocialAccount itself is never deleted here.
   *
   * Scope discipline mirrors every other method: `clientId` is proven by the
   * calling guard (ACTIVE agency relationship, or the X-Client-Id binding), and
   * the credential is located through the tenant-scoped account id, so a
   * caller cannot address another tenant's credential by guessing an id. A
   * miss is a uniform 404 with no existence leak.
   *
   * Revocation scope (V1, decision D1): this is a LOCAL delete. No outbound
   * call is made to the platform, so the token is destroyed on our side but may
   * remain live at the provider until it expires or is revoked there. Platform
   * revocation is deliberately deferred rather than silently half-done.
   *
   * The delete is idempotent: a repeated call removes zero rows and still
   * succeeds, so a double-click cannot fail the request.
   */
  async disconnect(
    clientId: string,
    socialAccountId: string,
    actorUserId: string,
  ): Promise<void> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, clientId },
      select: { id: true, platform: true },
    });
    if (!account) throw new NotFoundException('Social account not found');

    await this.prisma.socialAccountCredential.deleteMany({
      where: { socialAccountId: account.id },
    });

    // Audit trail: disconnect is a security-relevant action (AGENTS.md §11).
    await this.prisma.clientEvent.create({
      data: {
        clientId,
        actorUserId,
        action: 'social-account.oauth.disconnected',
        details: { platform: account.platform },
      },
    });
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