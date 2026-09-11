import { ConflictException, Injectable } from '@nestjs/common';
import type { Client, ClientStatus } from '@prisma/client';

import { ClientsService } from './clients.service.js';

export type StatusAuthority = 'AGENCY' | 'SOCIALOPS_ADMIN';

/**
 * Client operational status management (locked).
 *
 * - ClientStatus is EXACTLY ACTIVE | INACTIVE | SUSPENDED (no PENDING).
 * - The Client CANNOT change its own status (no client-side route exists;
 *   the explicit client-side status route always denies with 403).
 * - Allowed authorities: the currently assigned ACTIVE Agency (OWNER or
 *   ADMIN only — enforced by the route's RoleGuard) and SOCIALOPS_ADMIN.
 * - Every change is audited.
 */
@Injectable()
export class ClientStatusService {
  constructor(private readonly clientsService: ClientsService) {}

  async changeStatus(
    client: Client,
    next: ClientStatus,
    authority: StatusAuthority,
    actorUserId: string | null,
    reason?: string,
  ): Promise<Client> {
    if (client.status === next) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        detail: `Client is already ${next}`,
      });
    }
    const updated = await this.clientsService['prisma'].client.update({
      where: { id: client.id },
      data: {
        status: next,
        statusReason: reason ?? null,
        statusChangedAt: new Date(),
      },
    });
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'client.status.changed',
      { from: client.status, to: next, authority, reason: reason ?? null },
    );
    return updated;
  }
}