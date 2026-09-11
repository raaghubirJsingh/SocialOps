import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Client } from '@prisma/client';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { isBootArtifactsAllowed } from '../auth/email-audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';
import {
  INVITATION_TOKEN_BYTES,
  INVITATION_TOKEN_TTL_MS,
} from './constants/client-invitation.constants.js';
import { MobileVerificationService } from './mobile-verification.service.js';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface IssuedInvitation {
  invitationId: string;
  email: string;
  expiresAt: Date;
}

/**
 * Agency-created Client invitation flow (controlled pre-activation).
 *
 * Security properties (mirroring EmailVerificationToken):
 *   - Only the SHA-256 hash is stored; the raw token is never persisted.
 *   - Single-use (`usedAt`) with expiry.
 *   - The invited User's email MUST match the invitation email.
 *   - The Agency creator/issuer NEVER becomes the Client owner; the
 *     binding is created at acceptance ONLY (controlled onboarding).
 *   - Delivery is the gated local development log ONLY (BOOT_ARTIFACTS).
 */
@Injectable()
export class ClientInvitationService {
  private readonly logger = new Logger(ClientInvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly mobileVerification: MobileVerificationService,
  ) {}

  /** Issue an invitation for a PENDING, Agency-created Client. */
  async issueInvitation(
    client: Client,
    email: string,
    actorUserId: string,
  ): Promise<IssuedInvitation> {
    if (client.onboardingStatus !== 'PENDING') {
      throw new ConflictException({
        code: 'CLIENT_ALREADY_ONBOARDED',
        detail: 'Invitations can only be issued for PENDING Clients',
      });
    }

    const rawToken = randomBytes(INVITATION_TOKEN_BYTES).toString('hex');
    const invitation = await this.prisma.clientInvitation.create({
      data: {
        clientId: client.id,
        email: email.toLowerCase(),
        tokenHash: sha256Hex(rawToken),
        expiresAt: new Date(Date.now() + INVITATION_TOKEN_TTL_MS),
      },
    });

    this.maybeLogInvitationDelivery(email, rawToken);
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'client.invitation.issued',
      { invitationId: invitation.id, email: invitation.email },
    );
    return {
      invitationId: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Resolve a token for the acceptance screen. Deliberately minimal
   * payload (no operational data); invalid/expired/used tokens are
   * indistinguishable from unknown ones (fail closed).
   */
  async resolveInvitation(token: string) {
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { client: { select: { name: true, type: true } } },
    });
    if (
      !invitation ||
      invitation.usedAt !== null ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException('Invitation not found or no longer valid');
    }
    return {
      clientName: invitation.client.name,
      clientType: invitation.client.type,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Controlled pre-activation acceptance: validate token + email match +
   * email verification, then create the direct User -> Client binding
   * (the ONLY way a binding is created on the invitation path) and issue
   * the mobile verification token required to finish activation.
   */
  async acceptInvitation(token: string, user: JwtAccessPayload) {
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.usedAt !== null) {
      throw new ConflictException({ code: 'INVITATION_ALREADY_USED' });
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'INVITATION_EXPIRED' });
    }
    if (invitation.email !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        'The authenticated User does not match the invited email',
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser?.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        detail: 'Verify your email before accepting the invitation',
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: invitation.clientId },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (client.onboardingStatus === 'ACTIVE') {
      throw new ConflictException({ code: 'CLIENT_ALREADY_ONBOARDED' });
    }
    if (client.ownerUserId && client.ownerUserId !== user.sub) {
      throw new ConflictException({
        code: 'CLIENT_ALREADY_BOUND',
        detail: 'Client is bound to another User',
      });
    }

    // Controlled binding + single-use consumption.
    await this.prisma.clientInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    });
    if (client.ownerUserId === null) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { ownerUserId: user.sub },
      });
      await this.clientsService.recordEvent(
        client.id,
        user.sub,
        'client.bound',
        { ownerUserId: user.sub, source: 'INVITATION' },
      );
    }
    await this.clientsService.recordEvent(
      client.id,
      user.sub,
      'client.invitation.accepted',
      { invitationId: invitation.id },
    );

    const { expiresAt } = await this.mobileVerification.issueVerificationToken(
      client.id,
      user.sub,
    );
    return {
      clientId: client.id,
      mobileVerificationRequired: true,
      mobileVerificationExpiresAt: expiresAt,
    };
  }

  /** Gated local-development delivery ONLY (BOOT_ARTIFACTS mechanism). */
  private maybeLogInvitationDelivery(email: string, rawToken: string): void {
    if (!isBootArtifactsAllowed(process.env)) {
      return;
    }
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
    this.logger.log(
      `[boot-artifact] Client invitation URL for ${email}: ` +
        `${webUrl}/accept-invitation?token=${rawToken}`,
    );
  }
}