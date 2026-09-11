import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import { isBootArtifactsAllowed } from '../auth/email-audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MOBILE_VERIFICATION_TOKEN_BYTES,
  MOBILE_VERIFICATION_TOKEN_TTL_MS,
} from './constants/mobile-verification.constants.js';

/** SHA-256 hex digest - the only form of a token that is ever persisted. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Result of issuing a mobile verification token. */
export interface MobileVerificationIssue {
  /** Raw single-use token. NEVER persisted; dev-log delivery only. */
  rawToken: string;
  expiresAt: Date;
}

export type MobileTokenConsumptionOutcome =
  | 'CONSUMED'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ALREADY_USED';

/**
 * Discriminated consumption result (fail-closed). The later API layer maps
 * every outcome other than CONSUMED to a denial; no mobile number is ever
 * treated as verified unless this returns CONSUMED.
 */
export interface MobileTokenConsumption {
  outcome: MobileTokenConsumptionOutcome;
}

/**
 * Provider-independent mobile verification infrastructure (D3).
 *
 * Security properties:
 *   - The database stores ONLY the SHA-256 hash of the token.
 *   - Tokens are single-use (`usedAt`) and expire (`expiresAt`).
 *   - The raw token is never logged outside the approved local-development
 *     BOOT_ARTIFACTS gate - the exact mechanism already approved for email
 *     verification delivery. With the gate closed, nothing is logged.
 *   - No SMS provider integration; no paid service; no production provider
 *     assumption.
 */
@Injectable()
export class MobileVerificationService {
  private readonly logger = new Logger(MobileVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a mobile verification token for a Client. The raw token is
   * returned to the caller for gated dev-log delivery only - it is never
   * persisted and never returned through any public API response.
   */
  async issueVerificationToken(
    clientId: string,
    requestedByUserId: string | null = null,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<MobileVerificationIssue> {
    const rawToken = randomBytes(MOBILE_VERIFICATION_TOKEN_BYTES).toString(
      'hex',
    );
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + MOBILE_VERIFICATION_TOKEN_TTL_MS);

    // Persist the hash only - never the raw token.
    await this.prisma.mobileVerificationToken.create({
      data: { clientId, requestedByUserId, tokenHash, expiresAt },
    });

    this.maybeLogMobileDelivery(clientId, rawToken, env);
    return { rawToken, expiresAt };
  }

  /**
   * Consume a mobile verification token. Fails closed: every outcome other
   * than CONSUMED leaves the record untouched (a failed or cancelled
   * attempt never marks anything verified).
   */
  async consumeVerificationToken(
    clientId: string,
    rawToken: string,
  ): Promise<MobileTokenConsumption> {
    const tokenHash = sha256Hex(rawToken);
    const record = await this.prisma.mobileVerificationToken.findUnique({
      where: { tokenHash },
    });

    // Unknown token OR a token belonging to a different Client is
    // indistinguishable here (cross-Client isolation, fail-closed).
    if (!record || record.clientId !== clientId) {
      return { outcome: 'NOT_FOUND' };
    }
    if (record.usedAt !== null) {
      return { outcome: 'ALREADY_USED' };
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      return { outcome: 'EXPIRED' };
    }

    await this.prisma.mobileVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { outcome: 'CONSUMED' };
  }

  /**
   * Activation-path consumption (ACT-2): resolve a raw token to its Client
   * and consume it in one step, for flows where the caller knows only the
   * raw token (e.g. self-registration activation). Fails closed exactly
   * like `consumeVerificationToken`.
   */
  async resolveAndConsume(
    rawToken: string,
  ): Promise<
    | { outcome: 'CONSUMED'; clientId: string }
    | { outcome: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' }
  > {
    const tokenHash = sha256Hex(rawToken);
    const record = await this.prisma.mobileVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record) return { outcome: 'NOT_FOUND' };
    if (record.usedAt !== null) return { outcome: 'ALREADY_USED' };
    if (record.expiresAt.getTime() <= Date.now()) {
      return { outcome: 'EXPIRED' };
    }
    await this.prisma.mobileVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { outcome: 'CONSUMED', clientId: record.clientId };
  }

  /**
   * Local development delivery ONLY (approved BOOT_ARTIFACTS mechanism,
   * identical security posture to email verification delivery): with the
   * gate closed this is fully silent; nothing is written anywhere.
   */
  private maybeLogMobileDelivery(
    clientId: string,
    rawToken: string,
    env: NodeJS.ProcessEnv,
  ): void {
    if (!isBootArtifactsAllowed(env)) {
      return;
    }
    this.logger.log(
      `[boot-artifact] Mobile verification token for client ${clientId}: ${rawToken}`,
    );
  }
}