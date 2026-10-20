import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The ONLY approved body for a write attempted while the Client's onboarding
 * is still PENDING (HTTP 403).
 *
 * Tenant-blind: it names no organization, agency, user, or other client. The
 * caller already proved scope (ACTIVE relationship / owner binding) before
 * this check runs, so the ONLY new fact revealed is the lifecycle state of
 * the caller's own client.
 */
export const CLIENT_NOT_ACTIVE = {
  code: 'CLIENT_NOT_ACTIVE',
  message: 'This client is not active yet. Complete onboarding first.',
} as const;

/**
 * The ONLY approved body for Content creation with no usable SocialAccount
 * (HTTP 409).
 *
 * Tenant-blind: it states the prerequisite without naming any row, platform
 * account, or other tenant.
 */
export const SOCIAL_ACCOUNT_REQUIRED = {
  code: 'SOCIAL_ACCOUNT_REQUIRED',
  message:
    'Record at least one active social account for this client before creating content.',
} as const;

/**
 * Progressive operational gating (Client Operations V1 amendment).
 *
 * Enforces the approved lifecycle order:
 *   Overview (onboarding ACTIVE) → Social accounts → Raw data → Content.
 *
 * Rules:
 *   - `requireOnboardingActive` gates agency-side WRITES (social-account
 *     mutations, OAuth connect/disconnect + upload-url, content mutations,
 *     raw-data mutations). Reads stay open for PENDING clients.
 *   - `requireActiveSocialAccount` gates Content CREATION only (agency +
 *     client paths). Updates, transitions, revisions, and RawData are never
 *     gated by this check.
 *
 * Both helpers run AFTER the caller proved tenant scope (ACTIVE
 * ClientAgencyRelationship / owner binding), so they add lifecycle facts only
 * and never widen or replace the scope proof (AGENTS.md §§6-7).
 */
@Injectable()
export class OperationalGatingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Reject agency-side writes while the Client's onboarding is PENDING. */
  async requireOnboardingActive(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { onboardingStatus: true },
    });
    // The scope proof already ran; a missing row here is treated as inactive
    // rather than leaking a distinct existence signal.
    if (!client || client.onboardingStatus !== 'ACTIVE') {
      throw new ForbiddenException(CLIENT_NOT_ACTIVE);
    }
  }

  /** Reject Content creation when the Client has no active SocialAccount. */
  async requireActiveSocialAccount(clientId: string): Promise<void> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { clientId, isActive: true },
      select: { id: true },
    });
    if (!account) {
      throw new ConflictException(SOCIAL_ACCOUNT_REQUIRED);
    }
  }
}
