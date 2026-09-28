import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

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
 */
@Injectable()
export class SocialOpsProviderService {
  private readonly logger = new Logger(SocialOpsProviderService.name);

  /** Stable identity of the single platform provider tenant. */
  static readonly PROVIDER_SLUG = 'socialops';
  static readonly PROVIDER_NAME = 'SocialOps';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find-or-create the single SOCIALOPS Service-Provider Organization.
   *
   * Runs inside the caller's transaction so a failure rolls the whole
   * activation back rather than leaving a Client with no provider.
   */
  async ensureProviderOrganization(
    tx: Prisma.TransactionClient | PrismaClient,
  ): Promise<{ id: string }> {
    const existing = await tx.organization.findFirst({
      where: { kind: 'SOCIALOPS' },
      select: { id: true },
    });
    if (existing) return existing;

    try {
      return await tx.organization.create({
        data: {
          name: SocialOpsProviderService.PROVIDER_NAME,
          slug: SocialOpsProviderService.PROVIDER_SLUG,
          kind: 'SOCIALOPS',
          // Platform provider is attached automatically, so it is never part
          // of the external discovery catalog.
          discoveryOptIn: false,
          discoveryApprovedAt: null,
        },
        select: { id: true },
      });
    } catch (error) {
      // Lost a creation race: the partial unique index means exactly one
      // SOCIALOPS row can exist, so re-reading is the correct resolution.
      const raced = await tx.organization.findFirst({
        where: { kind: 'SOCIALOPS' },
        select: { id: true },
      });
      if (raced) return raced;

      // `Organization.slug` is globally UNIQUE and independent of `kind`
      // (schema.prisma:215), so a pre-existing external Agency can already
      // own the platform slug. Reusing or renaming that Agency is NOT an
      // option: it would silently repoint the platform Service Provider at a
      // third-party tenant. A raw Prisma error here would surface as an
      // opaque 500 on every activation, so fail with a controlled, actionable
      // error instead. The caller's transaction rolls back with it.
      if (isUniqueConstraintViolation(error)) {
        throw new InternalServerErrorException({
          code: 'SERVICE_PROVIDER_UNAVAILABLE',
          message:
            'Client activation is temporarily unavailable. Please try again later.',
          detail: `SERVICE_PROVIDER_UNAVAILABLE: organization slug "${SocialOpsProviderService.PROVIDER_SLUG}" is already in use by a non-platform organization. An administrator must provision the SocialOps Service Provider.`,
        });
      }
      throw error;
    }
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
    tx: Prisma.TransactionClient | PrismaClient,
    clientId: string,
  ): Promise<string | null> {
    const active = await tx.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
      select: { id: true, organizationId: true },
    });
    if (active) return active.organizationId;

    const provider = await this.ensureProviderOrganization(tx);
    try {
      const created = await tx.clientAgencyRelationship.create({
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
      // Concurrent activation of the SAME Client. The one-ACTIVE-per-client
      // partial unique index (migration 20260916000000) rejected our insert
      // because a competing transaction attached a provider first. Re-read and
      // adopt that relationship instead of failing the activation: the
      // invariant holds either way, and the loser still ends up with a valid
      // provider. A conflict with no ACTIVE relationship can never be
      // resolved this way, so it is rethrown.
      if (isUniqueConstraintViolation(error)) {
        const winner = await tx.clientAgencyRelationship.findFirst({
          where: { clientId, status: 'ACTIVE' },
          select: { organizationId: true },
        });
        if (winner) return winner.organizationId;
      }
      throw error;
    }
  }
}
