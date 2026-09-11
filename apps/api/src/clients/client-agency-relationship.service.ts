import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Client } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';

/**
 * Client <-> Agency relationship state machine (locked).
 *
 *   none -> PENDING_REQUEST  (Client requests an Agency)
 *   none -> PENDING_INVITATION (Agency requests/invites a Client)
 *   PENDING_* -> ACTIVE      (the OTHER party accepts)
 *   ACTIVE   -> TERMINATED   (explicit termination, either side)
 *
 * Locked rules enforced here:
 *   - Maximum ONE ACTIVE relationship per Client.
 *   - ACTIVE blocks any new relationship: explicit termination FIRST —
 *     `409 {code:'ACTIVE_RELATIONSHIP_EXISTS'}` (no silent replacement).
 *   - Termination removes the Agency's access (all Agency reads go through
 *     the ACTIVE relationship), keeps the Client intact, and NEVER touches
 *     Client.ownerUserId (binding and Agency state are separate concepts).
 *   - A rejected/cancelled PENDING request is closed as TERMINATED.
 */
@Injectable()
export class ClientAgencyRelationshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertNoActiveRelationship(clientId: string): Promise<void> {
    const active = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
    });
    if (active) {
      throw new ConflictException({
        code: 'ACTIVE_RELATIONSHIP_EXISTS',
        detail:
          'Terminate the current Agency relationship first (no silent replacement)',
      });
    }
  }

  /** Client requests a discoverable Agency (PENDING_REQUEST). */
  async createClientRequest(
    client: Client,
    organizationId: string,
    actorUserId: string,
  ) {
    await this.assertNoActiveRelationship(client.id);
    const duplicate = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId: client.id, organizationId, status: 'PENDING_REQUEST' },
    });
    if (duplicate) {
      throw new ConflictException({ code: 'REQUEST_ALREADY_PENDING' });
    }
    const relationship = await this.prisma.clientAgencyRelationship.create({
      data: {
        clientId: client.id,
        organizationId,
        status: 'PENDING_REQUEST',
        initiatedBy: 'CLIENT',
      },
    });
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'agency.request.created',
      { organizationId },
    );
    return relationship;
  }

  /** Agency requests/invites a Client (PENDING_INVITATION). */
  async createAgencyRequest(
    clientId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    await this.assertNoActiveRelationship(clientId);
    const duplicate = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, organizationId, status: 'PENDING_INVITATION' },
    });
    if (duplicate) {
      throw new ConflictException({ code: 'REQUEST_ALREADY_PENDING' });
    }
    const relationship = await this.prisma.clientAgencyRelationship.create({
      data: {
        clientId,
        organizationId,
        status: 'PENDING_INVITATION',
        initiatedBy: 'AGENCY',
      },
    });
    await this.clientsService.recordEvent(
      clientId,
      actorUserId,
      'agency.invitation.created',
      { organizationId },
    );
    return relationship;
  }

  /** The requesting Agency accepts a Client-initiated request. */
  async acceptClientRequestByAgency(
    relationshipId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const relationship = await this.prisma.clientAgencyRelationship.findUnique({
      where: { id: relationshipId },
    });
    if (!relationship || relationship.organizationId !== organizationId) {
      throw new NotFoundException('Agency request not found');
    }
    if (relationship.status !== 'PENDING_REQUEST') {
      throw new ConflictException({ code: 'INVALID_RELATIONSHIP_TRANSITION' });
    }
    await this.assertNoActiveRelationship(relationship.clientId);
    const updated = await this.prisma.clientAgencyRelationship.update({
      where: { id: relationship.id },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
    await this.clientsService.recordEvent(
      relationship.clientId,
      actorUserId,
      'agency.request.accepted',
      { organizationId },
    );
    return updated;
  }

  /** The Client accepts an Agency-initiated request. */
  async acceptAgencyRequestByClient(
    relationshipId: string,
    clientId: string,
    actorUserId: string,
  ) {
    const relationship = await this.prisma.clientAgencyRelationship.findUnique({
      where: { id: relationshipId },
    });
    if (!relationship || relationship.clientId !== clientId) {
      throw new NotFoundException('Agency invitation not found');
    }
    if (relationship.status !== 'PENDING_INVITATION') {
      throw new ConflictException({ code: 'INVALID_RELATIONSHIP_TRANSITION' });
    }
    await this.assertNoActiveRelationship(clientId);
    const updated = await this.prisma.clientAgencyRelationship.update({
      where: { id: relationship.id },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
    await this.clientsService.recordEvent(
      clientId,
      actorUserId,
      'agency.invitation.accepted',
      { organizationId: relationship.organizationId },
    );
    return updated;
  }

  /** Either side rejects/cancels a PENDING request (closed as TERMINATED). */
  async rejectPending(
    relationshipId: string,
    scope: { organizationId?: string; clientId?: string },
    actorUserId: string,
  ) {
    const relationship = await this.prisma.clientAgencyRelationship.findUnique({
      where: { id: relationshipId },
    });
    if (!relationship) throw new NotFoundException('Relationship not found');
    if (scope.organizationId && relationship.organizationId !== scope.organizationId) {
      throw new NotFoundException('Relationship not found');
    }
    if (scope.clientId && relationship.clientId !== scope.clientId) {
      throw new NotFoundException('Relationship not found');
    }
    if (
      relationship.status !== 'PENDING_REQUEST' &&
      relationship.status !== 'PENDING_INVITATION'
    ) {
      throw new ConflictException({ code: 'INVALID_RELATIONSHIP_TRANSITION' });
    }
    const updated = await this.prisma.clientAgencyRelationship.update({
      where: { id: relationship.id },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    await this.clientsService.recordEvent(
      relationship.clientId,
      actorUserId,
      'agency.request.rejected',
      { relationshipId: relationship.id, by: scope.clientId ? 'CLIENT' : 'AGENCY' },
    );
    return updated;
  }

  /**
   * Explicit termination by the Agency (OWNER/ADMIN route). Removes the
   * Agency's access, keeps the Client intact, and NEVER changes
   * Client.ownerUserId.
   */
  async terminateForAgency(
    clientId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const relationship = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, organizationId, status: 'ACTIVE' },
    });
    if (!relationship) {
      throw new NotFoundException('No active Agency relationship');
    }
    return this.terminate(relationship.id, clientId, actorUserId);
  }

  /** Explicit termination by the Client. */
  async terminateForClient(clientId: string, actorUserId: string) {
    const relationship = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
    });
    if (!relationship) {
      throw new NotFoundException('No active Agency relationship');
    }
    return this.terminate(relationship.id, clientId, actorUserId);
  }

  private async terminate(
    relationshipId: string,
    clientId: string,
    actorUserId: string,
  ) {
    const updated = await this.prisma.clientAgencyRelationship.update({
      where: { id: relationshipId },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    // ownerUserId is deliberately NOT touched (approved representation).
    await this.clientsService.recordEvent(
      clientId,
      actorUserId,
      'agency.relationship.terminated',
      { relationshipId },
    );
    return updated;
  }

  /** Pending Client-initiated requests for the acting Agency. */
  listPendingRequestsForOrganization(organizationId: string) {
    return this.prisma.clientAgencyRelationship.findMany({
      where: { organizationId, status: 'PENDING_REQUEST' },
      include: {
        client: { select: { id: true, name: true, type: true, directEmail: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Pending Agency-initiated requests for the Client. */
  listPendingInvitationsForClient(clientId: string) {
    return this.prisma.clientAgencyRelationship.findMany({
      where: { clientId, status: 'PENDING_INVITATION' },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Full relationship history for the Client (their own data). */
  listRelationshipsForClient(clientId: string) {
    return this.prisma.clientAgencyRelationship.findMany({
      where: { clientId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}