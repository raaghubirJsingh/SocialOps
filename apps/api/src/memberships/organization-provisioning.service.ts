import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Idempotent Service Provider tenant provisioning.
 *
 * Scope (approved):
 * - Triggered from AuthService.login only after successful credential +
 *   active + email-verified checks.
 * - Only provisions for `SERVICE_PROVIDER` users.
 * - Organization name = user's Full Name; fallback to email local-part.
 * - Organization slug = `sp-<userId>`.
 * - Creates exactly one OrganizationMembership with role `OWNER`.
 * - Does NOT create a Workspace or a Client.
 *
 * Non-blocking behaviour (approved):
 * - If provisioning fails for any reason, the valid login is still
 *   allowed. The error is logged/warned and retried on the next login.
 *
 * Idempotency / concurrency (approved):
 * - Repeated logins are safe.
 * - Concurrent provisioning must not create duplicate Organizations or
 *   duplicate memberships.
 *
 * This service deliberately does not touch `/memberships/me` (that route
 * remains JWT-only and read-only). It only creates the organizing records
 * that `/memberships/me` later reports.
 */
@Injectable()
export class OrganizationProvisioningService {
  private readonly logger = new Logger(OrganizationProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure a Service Provider tenant exists for the given user.
   *
   * Idempotent and safe under concurrent login. Non-blocking: any
   * failure is logged and the login proceeds; the next login retries.
   */
  async ensureForServiceProvider(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        displayName: true,
        accountType: true,
      },
    });

    if (!user) {
      this.logger.warn(
        `Provisioning skipped: unknown user ${userId} (login validation should have failed first)`,
      );
      return;
    }

    if (user.accountType !== 'SERVICE_PROVIDER') {
      return;
    }

    const existing = await this.prisma.organizationMembership.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const label = (user.fullName ?? user.displayName ?? extractEmailLocalPart(user.email)).trim();
    const name = `${label}'s organization`;
    const slug = `${slugify(label)}-${userId}`;

    try {
      await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name, slug },
        });
        await tx.organizationMembership.create({
          data: {
            userId,
            organizationId: organization.id,
            role: 'OWNER',
          },
        });
      });
      this.logger.debug(`Provisioned tenant for Service Provider ${userId}`);
    } catch (error) {
      if (isKnownUniqueViolation(error)) {
        this.logger.debug(
          `Provisioning race lost for user ${userId}; concurrent creation succeeded`,
        );
        return;
      }
      this.logger.warn(
        `Service Provider tenant provisioning failed for user ${userId}; login will proceed and retry next time. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function isKnownUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

function extractEmailLocalPart(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 0) {
    return email.trim().toLowerCase();
  }
  return email.slice(0, atIndex).trim().toLowerCase();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
