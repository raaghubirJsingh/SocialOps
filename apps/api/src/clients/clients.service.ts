import { Injectable } from '@nestjs/common';
import type { Client, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateClientDto } from './dto/create-client.dto.js';

/**
 * Client domain service (Client Module V1).
 *
 * Holds the shared data-access and audit helpers used by the guards, the
 * onboarding flows and the API controllers. Scoping rules:
 *   - Agency-side reads ALWAYS go through the ACTIVE relationship
 *     (`listClientsForOrganization` / `getClientForOrganization`) so a
 *     terminated Agency has no operational access and a new Agency never
 *     inherits anything.
 *   - Client-side reads go through the direct User -> Client binding
 *     (`findClientForOwner`).
 */
@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Load a Client by id (unscoped - callers must apply their own checks). */
  findClientById(clientId: string) {
    return this.prisma.client.findUnique({ where: { id: clientId } });
  }

  /**
   * Load a Client only when the direct User -> Client binding matches.
   * Used by client-side operational paths; returns null on any mismatch
   * (fail-closed, no existence leak).
   */
  findClientForOwner(clientId: string, ownerUserId: string) {
    return this.prisma.client.findFirst({
      where: { id: clientId, ownerUserId },
    });
  }

  /** Insert-only audit trail write (AGENTS.md §8). */
  async recordEvent(
    clientId: string,
    actorUserId: string | null,
    action: string,
    details?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.clientEvent.create({
      data: { clientId, actorUserId, action, details },
    });
  }

  /**
   * Agency-side creation: the Client starts PENDING and UNBOUND — the
   * creating Agency User NEVER becomes the owner. The creating
   * Organization becomes the (single, ACTIVE) managing Agency.
   */
  async createClientForOrganization(
    data: CreateClientDto,
    creatorUserId: string,
    organizationId: string,
  ): Promise<Client> {
    const client = await this.prisma.client.create({
      data: {
        ...data,
        onboardingStatus: 'PENDING',
      } as Prisma.ClientUncheckedCreateInput,
    });
    await this.prisma.clientAgencyRelationship.create({
      data: {
        clientId: client.id,
        organizationId,
        status: 'ACTIVE',
        initiatedBy: 'AGENCY',
        startedAt: new Date(),
      },
    });
    await this.recordEvent(client.id, creatorUserId, 'client.created', {
      source: 'AGENCY',
      type: client.type,
      organizationId,
    });
    return client;
  }

  /** Agency-side list: ONLY Clients with an ACTIVE relationship to the org. */
  listClientsForOrganization(organizationId: string) {
    return this.prisma.client.findMany({
      where: {
        relationships: { some: { organizationId, status: 'ACTIVE' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Agency-side read: the Client is visible only while the acting
   * Organization holds an ACTIVE relationship (no cross-Agency leakage).
   */
  getClientForOrganization(clientId: string, organizationId: string) {
    return this.prisma.client.findFirst({
      where: {
        id: clientId,
        relationships: { some: { organizationId, status: 'ACTIVE' } },
      },
    });
  }

  /**
   * Agency-side audit history. Approved visibility rule: a previous
   * Agency's events (before the current relationship started) are NOT
   * exposed — the previous Agency's internal information does not
   * transfer.
   */
  async getHistoryForOrganization(clientId: string, organizationId: string) {
    const client = await this.getClientForOrganization(clientId, organizationId);
    if (!client) return null;
    const relationship = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, organizationId, status: 'ACTIVE' },
    });
    return this.prisma.clientEvent.findMany({
      where: {
        clientId,
        ...(relationship?.startedAt
          ? { createdAt: { gte: relationship.startedAt } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Client-side audit history: the Client sees its own full audit trail. */
  getHistoryForOwner(clientId: string) {
    return this.prisma.clientEvent.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}