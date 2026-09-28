import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SocialPlatform } from '@prisma/client';

import { ClientsService } from '../../clients/clients.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TokenEncryptionService } from '../../crypto/token-encryption.service.js';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { OAuthStateService } from './oauth-state.service.js';
import type { OAuthStatePayload } from './oauth-state.service.js';
import { getOAuthProvider, oauthRedirectUri } from './providers/oauth-providers.js';

/** Expiry buffer: treat tokens expiring within 60s as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** Internal-only decrypted credential view for the future connector layer. */
export interface DecryptedCredential {
  accessToken: string;
  refreshToken: string | null;
  scopes: string;
  expiresAt: Date | null;
}

/** AAD binds every ciphertext to its tenant tuple - never to a URL. */
function credentialAad(clientId: string, platform: string): string {
  return `social-account:${clientId}:${platform}`;
}

/**
 * SocialAccount OAuth orchestration (approved AGENTS.md section 13 override;
 * Decision 013).
 *
 * Tenant isolation: the connect start is reachable from BOTH persona paths
 *   - AGENCY: verified organization context + ACTIVE ClientAgencyRelationship
 *     (ClientsService.getClientForOrganization - uniform 404 otherwise);
 *   - CLIENT: the ClientAccessGuard binding (`X-Client-Id`) + the ACTIVE
 *     relationship resolving the managing organization (uniform 403 when
 *     unmanaged - a self-registered client is never an Organization member).
 *
 * The CSRF state carries (sub, organizationId, clientId, platform) and is
 * re-proven at callback time BEFORE any token is stored. Platform tokens are
 * exchanged server-side, envelope-encrypted (AES-256-GCM), and persisted in
 * ONE transaction with the metadata row. No token ever reaches a response.
 */
@Injectable()
export class SocialAccountsOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly state: OAuthStateService,
    private readonly crypto: TokenEncryptionService,
  ) {}

  /**
   * Resolve the ACTIVE managing organization for a client-side connect.
   *
   * A self-registered Client is not an Organization member, so its tenant
   * context can ONLY come from the ACTIVE ClientAgencyRelationship. An
   * unmanaged Client therefore cannot mint an OAuth state, because the
   * state carries `organizationId` and the callback re-proves membership +
   * the ACTIVE relationship before any token is stored (approved Decision
   * 013: "uniform 403 when the client is unmanaged").
   *
   * This is a deliberate authorization boundary - it is NOT relaxed here.
   * The only change is a stable machine-readable `code`, so the UI can name
   * the actual prerequisite instead of showing a generic "not allowed" that
   * reads like a permissions bug. It leaks nothing: the caller already knows
   * their own Client has no managing Agency.
   */
  private async requireActiveManagingOrganization(
    clientId: string,
  ): Promise<string> {
    const relationship = await this.prisma.clientAgencyRelationship.findFirst({
      where: { clientId, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    if (!relationship) {
      throw new ForbiddenException({
        code: 'CLIENT_NOT_MANAGED',
        // Kept verbatim in step with the frontend CLIENT_NOT_MANAGED copy
        // (apps/web/lib/api-error-messages.ts) so an API client and the UI
        // explain the same requirement. It deliberately states the
        // prerequisite WITHOUT promising a self-serve "request an agency"
        // step: no such client-facing workflow exists in the UI yet.
        message:
          'Connecting a social account requires an active Service Provider relationship. Once an agency is connected to this workspace, you can authorise Instagram, Facebook or YouTube.',
        detail: 'CLIENT_NOT_MANAGED: no ACTIVE ClientAgencyRelationship.',
      });
    }
    return relationship.organizationId;
  }

  /** Re-prove the org membership recorded in the state still exists. */
  private async assertMembershipActive(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'Organization membership is no longer active',
      );
    }
  }

  /** Re-prove the client relationship recorded in the state is still ACTIVE. */
  private async assertClientRelationshipActive(
    clientId: string,
    organizationId: string,
  ): Promise<void> {
    const client =
      await this.clientsService.getClientForOrganization(clientId, organizationId);
    if (!client) throw new NotFoundException('Client not found');
  }

  /**
   * Callback-time proof that the ACTING USER is still authorized for the
   * tenant recorded in the verified state.
   *
   * The proof is source-dependent because the two personas are authorized by
   * genuinely different facts - this is a fix for an authorization MISMATCH,
   * not a relaxation of any check:
   *
   *  - AGENCY: the operator connects an account FOR the Organization, so an
   *    active OrganizationMembership is the correct proof. UNCHANGED.
   *  - CLIENT: the Client OWNER connects an account FOR THEIR OWN Client. A
   *    client owner is intentionally never an Organization member
   *    (AGENTS.md §6 - Workspace access is mediated through Organization
   *    membership, and a client owner has none). Demanding membership here
   *    therefore failed for EVERY client-side connect: both platform
   *    Service-Provider Clients (Decision 012) and external-Agency Clients.
   *
   * The CLIENT proof is strictly stronger than the ACTIVE relationship it
   * replaces, and every fact is re-read from PostgreSQL on each callback:
   *   1. the actor must still OWN the Client named in the state, and
   *   2. the organization must still be that Client's ACTIVE managing provider.
   *
   * A Client that was re-owned, terminated, or whose provider relationship
   * changed mid-flow fails closed. `assertClientRelationshipActive` runs for
   * BOTH sources and enforces the one-ACTIVE-Agency invariant unchanged.
   */
  private async assertActorAuthorizedForConnection(
    payload: OAuthStatePayload,
  ): Promise<void> {
    if (payload.source === 'AGENCY') {
      await this.assertMembershipActive(payload.sub, payload.organizationId);
      await this.assertClientRelationshipActive(
        payload.clientId,
        payload.organizationId,
      );
      return;
    }

    // CLIENT source: ownership replaces membership. A single uniform 403 for
    // "not the owner" and "no such Client" so the callback leaks no existence
    // information.
    const owned = await this.prisma.client.findFirst({
      where: { id: payload.clientId, ownerUserId: payload.sub },
      select: { id: true },
    });
    if (!owned) {
      throw new ForbiddenException(
        'Not authorized to connect social accounts for this Client',
      );
    }
    await this.assertClientRelationshipActive(
      payload.clientId,
      payload.organizationId,
    );
  }

  async startConnectAgency(
    user: JwtAccessPayload,
    organizationId: string,
    clientId: string,
    platform: SocialPlatform,
  ): Promise<{ authorizeUrl: string; expiresIn: number }> {
    // ACTIVE relationship proof (uniform 404 otherwise).
    await this.assertClientRelationshipActive(clientId, organizationId);
    const authorizeUrl = await this.state.mint({
      sub: user.sub,
      organizationId,
      clientId,
      platform,
      source: 'AGENCY',
    });
    return { authorizeUrl, expiresIn: 600 };
  }

  async startConnectClient(
    clientId: string,
    platform: SocialPlatform,
  ): Promise<{ authorizeUrl: string; expiresIn: number }> {
    // X-Client-Id binding is the tenant context (ClientAccessGuard proved it);
    // the organization comes from the ACTIVE relationship (403 when unmanaged).
    const organizationId = await this.requireActiveManagingOrganization(clientId);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { ownerUserId: true },
    });
    if (!client?.ownerUserId) {
      throw new ForbiddenException('Client binding is incomplete');
    }
    const authorizeUrl = await this.state.mint({
      // The client OWNER user id - never a client-supplied value.
      sub: client.ownerUserId,
      organizationId,
      clientId,
      platform,
      source: 'CLIENT',
    });
    return { authorizeUrl, expiresIn: 600 };
  }

  /**
   * Full handshake completion. Throws ONLY typed errors the callback
   * controller maps onto redirect error codes (the browser must never see a
   * stack trace, and never a token).
   */
  async completeConnect(
    platform: SocialPlatform,
    code: string,
    payload: OAuthStatePayload,
  ): Promise<{ clientId: string }> {
    // The callback controller has ALREADY verified and consumed the state, so
    // this service never re-consumes the nonce. The tenant context is
    // therefore taken from the verified payload, never from the request.
    if (payload.platform !== platform) {
      throw new ForbiddenException('Invalid OAuth state');
    }

    // Callback-time authorization re-verification (the callback route is
    // public): the ACTING USER must still be authorized for the tenant named
    // in the state, and the relationship must STILL be ACTIVE.
    await this.assertActorAuthorizedForConnection(payload);

    const provider = getOAuthProvider(platform);
    const redirectUri = oauthRedirectUri(platform);
    const exchanged = await provider.exchangeCode(code, redirectUri);
    const profile = await provider.fetchProfile(exchanged.accessToken);

    const aad = credentialAad(payload.clientId, platform);
    const access = this.crypto.encrypt(exchanged.accessToken, aad);
    const refresh = exchanged.refreshToken
      ? this.crypto.encrypt(exchanged.refreshToken, aad)
      : null;
    const expiresAt =
      typeof exchanged.expiresIn === 'number'
        ? new Date(Date.now() + exchanged.expiresIn * 1000 - EXPIRY_SKEW_MS)
        : null;

    await this.prisma.$transaction(async (tx) => {
      const account = await tx.socialAccount.upsert({
        where: {
          clientId_platform_platformAccountId: {
            clientId: payload.clientId,
            platform,
            platformAccountId: profile.platformAccountId,
          },
        },
        create: {
          clientId: payload.clientId,
          platform,
          platformAccountId: profile.platformAccountId,
          displayName: profile.displayName ?? null,
          isActive: true,
          createdByUserId: payload.sub,
        },
        update: {
          displayName: profile.displayName ?? null,
        },
        select: { id: true },
      });

      // 1:1 credential: upsert replaces the previous ciphertext wholesale.
      await tx.socialAccountCredential.upsert({
        where: { socialAccountId: account.id },
        create: {
          socialAccountId: account.id,
          tokenKeyVersion: access.tokenKeyVersion,
          accessTokenCiphertext: access.ciphertext,
          refreshTokenCiphertext: refresh?.ciphertext ?? null,
          scopes: exchanged.scope ?? '',
          expiresAt,
        },
        update: {
          tokenKeyVersion: access.tokenKeyVersion,
          accessTokenCiphertext: access.ciphertext,
          refreshTokenCiphertext: refresh?.ciphertext ?? null,
          scopes: exchanged.scope ?? '',
          expiresAt,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: payload.clientId,
          actorUserId: payload.sub,
          action: 'social-account.oauth.connected',
          details: { platform, source: payload.source },
        },
      });
    });

    return { clientId: payload.clientId };
  }

  /**
   * INTERNAL ONLY - decrypted tokens for the future connector/adapter layer
   * making platform API calls. Never exposed by any controller or route.
   */
  async getDecryptedCredentialForUse(
    clientId: string,
    socialAccountId: string,
  ): Promise<DecryptedCredential | null> {
    const record = await this.prisma.socialAccountCredential.findFirst({
      where: { socialAccountId, socialAccount: { clientId } },
      select: {
        accessTokenCiphertext: true,
        refreshTokenCiphertext: true,
        scopes: true,
        expiresAt: true,
        socialAccount: { select: { platform: true } },
      },
    });
    if (!record) return null;

    const aad = credentialAad(clientId, record.socialAccount.platform);
    return {
      accessToken: this.crypto.decrypt(record.accessTokenCiphertext, aad),
      refreshToken: record.refreshTokenCiphertext
        ? this.crypto.decrypt(record.refreshTokenCiphertext, aad)
        : null,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
    };
  }
}