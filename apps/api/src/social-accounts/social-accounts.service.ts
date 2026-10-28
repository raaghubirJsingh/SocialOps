import { ConflictException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSocialAccountDto } from './dto/create-social-account.dto.js';
import type { ListSocialAccountsQuery } from './dto/list-social-accounts.dto.js';
import type { UpdateSocialAccountDto } from './dto/update-social-account.dto.js';
import { normalizeProfileUrl, trimProfileUrl } from './lib/profile-url-normalization.js';
import { profileUrlMatchesPlatform } from './lib/profile-url-platform.js';

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
 * The ONLY approved body for a global profileUrl collision (HTTP 409).
 *
 * Deliberately tenant-blind: it never names the Client, Agency or
 * Organization that holds the URL. The uniqueness rule spans every tenant by
 * design, so the ONLY fact a caller may learn is "this URL is taken" -
 * nothing else about the holder may leak (AGENTS.md sections 6-7).
 */
export const SOCIAL_ACCOUNT_URL_UNAVAILABLE = {
  code: 'SOCIAL_ACCOUNT_URL_UNAVAILABLE',
  message: 'This URL is not available',
} as const;

/**
 * The ONLY approved body for a profileUrl that does not belong to the account's
 * platform (HTTP 400).
 *
 * A 400, never a 409: a mismatch is a malformed request about THIS caller's own
 * input, not a collision with someone else's row. The ordering in create()/
 * update() therefore runs this check BEFORE assertProfileUrlAvailable, so a
 * mismatched URL always answers 400 even when the same canonical URL is also
 * already taken - otherwise the caller would learn a 409 about a URL they were
 * never allowed to use in the first place.
 *
 * The body names no client, agency, organization or other tenant: a mismatch
 * is purely about the submitted string versus the selected platform.
 */
export const SOCIAL_ACCOUNT_URL_PLATFORM_MISMATCH = {
  code: 'SOCIAL_ACCOUNT_URL_PLATFORM_MISMATCH',
  message: 'This URL does not match the selected platform',
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
    // Stored (trimmed) URL and its GLOBAL uniqueness key always agree:
    // whitespace-only input stores NULL on both sides, never `"   "`.
    const profileUrl = trimProfileUrl(dto.profileUrl);
    const normalizedUrl = normalizeProfileUrl(profileUrl);

    // Platform-vs-host FIRST, so a mismatch is always a 400 and never a 409
    // about a URL the caller was not permitted to use for this platform.
    if (profileUrl !== null && !profileUrlMatchesPlatform(dto.platform, profileUrl)) {
      throw new BadRequestException(SOCIAL_ACCOUNT_URL_PLATFORM_MISMATCH);
    }

    if (normalizedUrl) {
      await this.assertProfileUrlAvailable(normalizedUrl);
    }

    try {
      const created = await this.prisma.socialAccount.create({
        data: {
          clientId,
          platform: dto.platform,
          platformAccountId: dto.platformAccountId ?? null,
          handle: dto.handle ?? null,
          displayName: dto.displayName ?? null,
          profileUrl,
          normalizedUrl,
          isActive: dto.isActive ?? true,
          createdByUserId: actorUserId,
        },
        select: SOCIAL_ACCOUNT_LIST_SELECT,
      });
      // A brand-new metadata row has no credential yet.
      return toSocialAccountDto(created);
    } catch (error) {
      throwIfUniqueConstraintViolation(error);
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
    //
    // Its result is now CAPTURED because platform is immutable after creation
    // (decision D10) and the update DTO omits `platform`, so this is the only
    // place the account's platform can come from. The read already selects
    // `platform` (SOCIAL_ACCOUNT_SELECT), so this adds NO extra query.
    const account = await this.findOneForClient(clientId, socialAccountId);

    // `undefined` means "leave unchanged" (Prisma ignores it); a provided
    // value ALWAYS rewrites the stored URL and its global key together, so
    // the two can never drift apart.
    const data: Prisma.SocialAccountUncheckedUpdateInput = { ...dto };
    if (dto.profileUrl !== undefined) {
      const profileUrl = trimProfileUrl(dto.profileUrl);
      const normalizedUrl = normalizeProfileUrl(profileUrl);

      // Platform-vs-host, against the EXISTING row's platform. Same ordering
      // as create(): a mismatch is a 400 and wins over the uniqueness 409.
      //
      // Only runs when a non-null URL was actually SENT. An update that omits
      // profileUrl (undefined) or clears it (null) is NOT validated, so an
      // edit of other fields keeps working on a legacy row that already holds
      // a mismatched URL - this rule must not make such a row uneditable.
      if (profileUrl !== null && !profileUrlMatchesPlatform(account.platform, profileUrl)) {
        throw new BadRequestException(SOCIAL_ACCOUNT_URL_PLATFORM_MISMATCH);
      }

      // Self-exclusion: an edit that does not change this row's URL must
      // never conflict with the row itself.
      if (normalizedUrl) {
        await this.assertProfileUrlAvailable(normalizedUrl, socialAccountId);
      }
      data.profileUrl = profileUrl;
      data.normalizedUrl = normalizedUrl;
    }

    try {
      const updated = await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        data,
        select: SOCIAL_ACCOUNT_LIST_SELECT,
      });
      return toSocialAccountDto(updated);
    } catch (error) {
      throwIfUniqueConstraintViolation(error);
      throw error;
    }
  }

  /**
   * Global availability probe for a normalized URL (approved uniqueness
   * decision).
   *
   * Cross-tenant BY DESIGN - the key spans every Client and every
   * Service Provider - but only EXISTENCE is read: no tenant id, handle,
   * platform or URL ever leaves this method, and the answer is always the
   * same generic 409 (SOCIAL_ACCOUNT_URL_UNAVAILABLE), so the probe cannot
   * be used to discover WHO holds an URL (AGENTS.md sections 6-7). The
   * database's unique index remains the authoritative check; this exists
   * only to turn the common case into a clean 409 instead of a race.
   *
   * `excludeId` exempts a row from its own URL, so editing an account
   * without changing its URL always succeeds.
   */
  private async assertProfileUrlAvailable(
    normalizedUrl: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.socialAccount.findFirst({
      where: excludeId
        ? { normalizedUrl, id: { not: excludeId } }
        : { normalizedUrl },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(SOCIAL_ACCOUNT_URL_UNAVAILABLE);
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
 * Maps a unique-constraint violation (Prisma P2002) to its approved 409
 * instead of a raw 500.
 *
 * WHICH constraint fired is read from `meta.target`, so the GLOBAL URL key
 * and the legacy per-client platform triple never receive each other's
 * message:
 *   - `normalizedUrl`          -> generic, tenant-blind URL-unavailable 409;
 *   - (clientId, platform,
 *      platformAccountId)      -> the pre-existing per-client duplicate 409;
 *   - unreadable/absent target -> the legacy answer, i.e. behaviour is
 *                                 unchanged from before the URL index existed.
 * The `normalizedUrl` test is a SUBSTRING match so both the array shape
 * (['normalizedUrl']) and the index-name string shape
 * ('SocialAccount_normalizedUrl_key') are recognised (FIX 2).
 * NULL platform identifiers stay exempt by Postgres semantics (NULLs are
 * distinct), which is intended: several not-yet-identified accounts of the
 * same platform may coexist.
 */
function throwIfUniqueConstraintViolation(error: unknown): void {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    // Prisma reports `meta.target` in MORE THAN ONE SHAPE depending on driver
    // and version: an array of column names (['normalizedUrl']) for a plain
    // `@unique` field, an array of fields for a compound `@@unique`, and - for
    // a named/index-form target - a single STRING naming the constraint or
    // index (e.g. 'SocialAccount_normalizedUrl_key'). The check is therefore a
    // SUBSTRING test, so every one of those shapes resolves to the same
    // URL-unavailable answer instead of leaking a raw 500 on a shape we did
    // not anticipate. `includes` (not `===`) is what makes the index-name
    // form work; exact equality would miss it.
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    const columns = Array.isArray(target)
      ? target.map((entry) => String(entry))
      : typeof target === 'string'
        ? [target]
        : [];

    if (columns.some((column) => column.includes('normalizedUrl'))) {
      throw new ConflictException(SOCIAL_ACCOUNT_URL_UNAVAILABLE);
    }

    throw new ConflictException({
      code: 'DUPLICATE_SOCIAL_ACCOUNT',
      message: 'This platform account is already registered for this client',
    });
  }
}