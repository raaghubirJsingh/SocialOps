import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

/** How many fresh transactions provisioning may use before giving up. */
const MAX_PROVISION_ATTEMPTS = 5;

/**
 * True for a PostgreSQL unique-constraint violation (Prisma P2002).
 *
 * Used to distinguish "a concurrent transaction won this race" from "this
 * insert can never succeed", so a genuine configuration conflict is reported
 * as a controlled error instead of an opaque database failure.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * True when `db` is a caller-owned transaction client, not a standalone client.
 *
 * This distinction is load-bearing. PostgreSQL aborts the ENTIRE transaction
 * when any statement inside it fails, so after a P2002 every later statement
 * on that transaction client fails too (`25P02 current transaction is
 * aborted`) until rollback. A transaction client can therefore never be used
 * for the recovery read a uniqueness race needs.
 *
 * `Prisma.TransactionClient` deliberately omits the connection-level
 * `$transaction` method, which is the stable shape difference used here.
 */
function isTransactionClient(
  db: Prisma.TransactionClient | PrismaClient,
): db is Prisma.TransactionClient {
  return typeof (db as { $transaction?: unknown }).$transaction !== 'function';
}

/**
 * Raised from INSIDE a caller-owned transaction when the platform Service
 * Provider Organization does not exist yet.
 *
 * The row is deliberately not created there: if that INSERT lost a uniqueness
 * race, the caller's transaction would be aborted and the fallback read could
 * never run. Instead the caller provisions on a dedicated connection (see
 * {@link SocialOpsProviderService.provisionProviderOrganization}) and retries
 * its unit of work in a brand-new transaction.
 */
export class ProviderProvisioningRequiredError extends Error {
  readonly code = 'PROVIDER_PROVISIONING_REQUIRED' as const;

  constructor() {
    super(
      'The SocialOps Service Provider organization has not been provisioned yet',
    );
    this.name = 'ProviderProvisioningRequiredError';
  }
}

/**
 * Raised when a concurrent activation attached a Service Provider to the SAME
 * Client first (P2002 on the one-ACTIVE-per-client partial unique index).
 *
 * The relationship insert failed, so the caller's transaction is already
 * aborted and must not be queried again. The caller retries in a fresh
 * transaction, where the pre-read adopts the winning relationship - the
 * invariant holds either way and the loser still ends up with one provider.
 */
export class ProviderAttachRaceError extends Error {
  readonly code = 'PROVIDER_ATTACH_RACE' as const;

  constructor(readonly clientId: string) {
    super(
      `A concurrent activation already attached a Service Provider to client ${clientId}`,
    );
    this.name = 'ProviderAttachRaceError';
  }
}

/** True when the platform provider still has to be provisioned. */
export function isProviderProvisioningRequired(error: unknown): boolean {
  return error instanceof ProviderProvisioningRequiredError;
}

/** True when a concurrent activation attached a provider to the same Client. */
export function isProviderAttachRace(error: unknown): boolean {
  return error instanceof ProviderAttachRaceError;
}

/**
 * The platform-owned SocialOps Service-Provider Organization (Decision 012).
 *
 * Decision 012 authorises SocialOps to hold exactly ONE platform-owned
 * Service-Provider Organization and to "participate in the existing
 * ClientAgencyRelationship machinery", with the one-ACTIVE-Agency invariant
 * unchanged. This service is the only place that Organization is identified,
 * created, or attached to a Client.
 *
 * Safety properties:
 *   - SINGLETON. The Organization is resolved by `kind = 'SOCIALOPS'`, never
 *     by a caller-supplied id. A partial unique index
 *     (`Organization_one_socialops_idx`, migration 20260919000000) makes a
 *     second SOCIALOPS row impossible, so find-or-create is race-safe.
 *   - NOT DISCOVERABLE. The provider is attached automatically; it is never
 *     opted into the external Agency discovery catalog and is never offered
 *     as a user-selectable choice.
 *   - IDEMPOTENT. Attaching is a no-op when the Client already has ANY
 *     active relationship, so a Client managed by an external Agency is
 *     never silently reassigned to SocialOps (Decision 012: switching
 *     provider requires the explicit termination / re-engagement flow).
 *   - ABORT-SAFE. No statement that can fail is ever executed on a caller's
 *     transaction client, so no recovery query is ever issued against an
 *     already-aborted PostgreSQL transaction (see
 *     {@link ProviderProvisioningRequiredError} and
 *     {@link ProviderAttachRaceError}).
 */
@Injectable()
export class SocialOpsProviderService {
  private readonly logger = new Logger(SocialOpsProviderService.name);

  /** Stable identity of the single platform provider tenant. */
  static readonly PROVIDER_SLUG = 'socialops';
  static readonly PROVIDER_NAME = 'SocialOps';

  /**
   * Slugs tried, in order, when the provider Organization is provisioned.
   *
   * `Organization.slug` is globally UNIQUE and independent of `kind`
   * (schema.prisma:250), so a pre-existing external Agency can already own the
   * preferred slug. Reusing or renaming that Agency is NOT an option - it would
   * silently repoint the platform Service Provider at a third-party tenant -
   * so provisioning moves to the FIRST FREE alternate slug instead. Identity
   * is always `kind = 'SOCIALOPS'` (enforced by the partial unique index),
   * never the slug, so an alternate slug is safe and, once provisioned, stays
   * stable for the lifetime of the tenant.
   */
  static readonly PROVIDER_SLUG_CANDIDATES: readonly string[] = [
    SocialOpsProviderService.PROVIDER_SLUG,
    `${SocialOpsProviderService.PROVIDER_SLUG}-provider`,
    `${SocialOpsProviderService.PROVIDER_SLUG}-service-provider`,
    `${SocialOpsProviderService.PROVIDER_SLUG}-platform`,
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find-or-create the single SOCIALOPS Service-Provider Organization.
   *
   * Reads through the client it is given, so a caller's transaction sees
   * exactly what it wrote. Creation NEVER happens on a caller-owned
   * transaction client: a P2002 there would abort the caller's transaction and
   * make the race recovery impossible. Instead this signals
   * {@link ProviderProvisioningRequiredError}, and the caller provisions on a
   * dedicated connection (or calls
   * {@link provisionProviderOrganization} up front - it is idempotent).
   */
  async ensureProviderOrganization(
    db: Prisma.TransactionClient | PrismaClient = this.prisma,
  ): Promise<{ id: string }> {
    const existing = await this.findProviderOrganization(db);
    if (existing) return existing;

    if (isTransactionClient(db)) throw new ProviderProvisioningRequiredError();

    return this.provisionProviderOrganization();
  }

  /**
   * Provision the platform provider, if it is still missing. Idempotent.
   *
   * Runs in its OWN transaction on the base client so that a uniqueness
   * conflict is retried with a FRESH transaction - an aborted transaction is
   * never reused. Every attempt first re-reads `kind = 'SOCIALOPS'` (a
   * concurrent winner is adopted, keeping the provider a singleton) and then
   * picks the first free slug, so a slug owned by an external Agency simply
   * moves provisioning to the next candidate instead of failing activation.
   */
  async provisionProviderOrganization(): Promise<{ id: string }> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Re-read on every attempt: a concurrent activation may have
          // provisioned the singleton while we were losing the race.
          const existing = await this.findProviderOrganization(tx);
          if (existing) return existing;

          const slug = await this.selectProviderSlug(tx);
          const created = await tx.organization.create({
            data: {
              name: SocialOpsProviderService.PROVIDER_NAME,
              slug,
              kind: 'SOCIALOPS',
              // Platform provider is attached automatically, so it is never
              // part of the external discovery catalog.
              discoveryOptIn: false,
              discoveryApprovedAt: null,
            },
            select: { id: true },
          });
          this.logger.log(
            `Provisioned the SocialOps Service Provider organization (slug "${slug}")`,
          );
          return created;
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        lastError = error;
        // Lost a race. The transaction that failed is gone; the next attempt
        // starts from a brand-new one, so the recovery read is never issued
        // against an aborted transaction.
        this.logger.debug(
          `SocialOps Service Provider provisioning attempt ${attempt}/${MAX_PROVISION_ATTEMPTS} lost a uniqueness race; retrying on a fresh transaction`,
        );
      }
    }

    this.logger.error(
      `SocialOps Service Provider could not be provisioned after ${MAX_PROVISION_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    throw new InternalServerErrorException({
      code: 'SERVICE_PROVIDER_UNAVAILABLE',
      message:
        'Client activation is temporarily unavailable. Please try again later.',
      detail:
        'SERVICE_PROVIDER_UNAVAILABLE: the SocialOps Service Provider organization could not be provisioned. An administrator must provision it.',
    });
  }

  /**
   * Attach the platform provider to a Client when it has none.
   *
   * Idempotent by construction: returns without writing when ANY active
   * relationship already exists, so external-Agency-managed Clients are left
   * exactly as they are. The caller's transaction provides the atomicity -
   * Client + relationship either both land or neither does.
   *
   * @returns the ACTIVE relationship organizationId, or null when the Client
   *          is already (or stays) unmanaged.
   */
  async attachIfUnmanaged(
    db: Prisma.TransactionClient | PrismaClient,
    clientId: string,
  ): Promise<string | null> {
    const active = await this.findActiveRelationship(db, clientId);
    if (active) return active.organizationId;

    // Read-only inside a caller-owned transaction; provisions on its own
    // connection only when `db` IS the base client.
    const provider = await this.ensureProviderOrganization(db);

    try {
      const created = await db.clientAgencyRelationship.create({
        data: {
          clientId,
          organizationId: provider.id,
          status: 'ACTIVE',
          initiatedBy: 'PLATFORM',
          startedAt: new Date(),
        },
        select: { id: true, organizationId: true },
      });
      this.logger.log(
        `Attached platform Service Provider to client ${clientId}`,
      );
      return created.organizationId;
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;

      // The one-ACTIVE-per-client partial unique index (migration
      // 20260916000000) rejected our insert because a competing transaction
      // attached a provider first. A standalone client is still usable, so the
      // winner can be adopted directly.
      if (!isTransactionClient(db)) {
        const winner = await this.findActiveRelationship(db, clientId);
        if (winner) return winner.organizationId;
        // Not the one-ACTIVE race: a genuine conflict that must not be
        // swallowed, exactly as before.
        throw error;
      }

      // Inside a caller-owned transaction the connection is aborted: reading
      // from it would only raise 25P02. Signal the race so the caller retries
      // the whole unit of work in a FRESH transaction, where the pre-read
      // adopts the winning relationship. A conflict that no ACTIVE
      // relationship can explain is NOT swallowed: the retry surfaces it
      // again and the caller rethrows it.
      throw new ProviderAttachRaceError(clientId);
    }
  }

  /** The single platform provider row, or null when it does not exist yet. */
  private findProviderOrganization(
    db: Prisma.TransactionClient | PrismaClient,
  ): Promise<{ id: string } | null> {
    return db.organization.findFirst({
      where: { kind: 'SOCIALOPS' },
      select: { id: true },
    });
  }

  /** The Client's ACTIVE provider relationship, or null when it has none. */
  private findActiveRelationship(
    db: Prisma.TransactionClient | PrismaClient,
    clientId: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    return db.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
      select: { id: true, organizationId: true },
    });
  }

  /**
   * First slug no Organization owns, preferring {@link PROVIDER_SLUG}.
   *
   * Never mutates the Organization that owns a candidate slug: renaming or
   * reusing it would hand the platform Service Provider role to a third-party
   * tenant.
   */
  private async selectProviderSlug(
    db: Prisma.TransactionClient | PrismaClient,
  ): Promise<string> {
    const candidates = SocialOpsProviderService.PROVIDER_SLUG_CANDIDATES;
    const claimed = await db.organization.findMany({
      where: { slug: { in: [...candidates] } },
      select: { slug: true },
    });
    const claimedSlugs = new Set(
      claimed.map((organization) => organization.slug),
    );
    const free = candidates.find((candidate) => !claimedSlugs.has(candidate));
    if (free) return free;

    // Every candidate is owned by a non-platform Organization. Failing with a
    // controlled, actionable error is the only safe option.
    throw new InternalServerErrorException({
      code: 'SERVICE_PROVIDER_UNAVAILABLE',
      message:
        'Client activation is temporarily unavailable. Please try again later.',
      detail: `SERVICE_PROVIDER_UNAVAILABLE: every reserved provider slug (${candidates.join(
        ', ',
      )}) is already in use by a non-platform organization. An administrator must provision the SocialOps Service Provider.`,
    });
  }
}

