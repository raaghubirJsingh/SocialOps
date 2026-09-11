import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { ClientField, type Client } from '@prisma/client';
import { z } from 'zod';

import { isBootArtifactsAllowed } from '../auth/email-audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';
import { cooldownForField } from './constants/field-cooldowns.js';
import {
  FIELD_COLUMN_MAP,
  SECURITY_CONTROLLED_FIELDS,
} from './constants/field-columns.js';
import { industrySchema } from './constants/industries.js';
import { sha256Hex } from './client-invitation.service.js';
import { MobileVerificationService } from './mobile-verification.service.js';

/** New-value verification window (email-change tokens). */
const FIELD_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface FieldChangeRequestParams {
  client: Client;
  field: ClientField;
  value: string | null;
  actorUserId: string;
  source: 'AGENCY' | 'CLIENT';
  currentPassword?: string;
}

export type FieldChangeResult =
  | { status: 'APPLIED'; field: ClientField }
  | { status: 'PENDING_VERIFICATION'; field: ClientField; changeId: string };

/**
 * Client profile field-change pipeline (approved rules, ACT-2).
 *
 * - Exact approved cooldown table (`field-cooldowns.ts`); violations get
 *   `409 {code:'COOLDOWN_ACTIVE', retryAt}`. NOTES and the PRIMARY_CONTACT
 *   fields carry NO cooldown (locked D2 / approved table).
 * - Security-controlled fields (NAME / DIRECT_EMAIL / DIRECT_MOBILE)
 *   require re-authentication: a missing `currentPassword` yields
 *   `409 {code:'VERIFICATION_REQUIRED'}`; a wrong password yields 403.
 * - DIRECT_EMAIL additionally requires verification of the NEW email
 *   (hash-only token on the change row, single-use + expiry, dev-log
 *   delivery only); DIRECT_MOBILE uses the MobileVerificationToken model.
 * - NAME applies after re-auth only (locked: no second verification).
 * - ownerUserId is NEVER writable through this pipeline.
 */
@Injectable()
export class ClientFieldChangeService {
  private readonly logger = new Logger(ClientFieldChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly mobileVerification: MobileVerificationService,
  ) {}

  async requestFieldChange(
    params: FieldChangeRequestParams,
  ): Promise<FieldChangeResult> {
    const { client, field, value, actorUserId, source, currentPassword } =
      params;

    if (SECURITY_CONTROLLED_FIELDS.has(field)) {
      if (!currentPassword) {
        throw new ConflictException({
          code: 'VERIFICATION_REQUIRED',
          detail: 'Re-authentication (current password) is required',
        });
      }
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
      });
      if (
        !actor?.passwordHash ||
        !(await argon2.verify(actor.passwordHash, currentPassword))
      ) {
        throw new ForbiddenException('Security check failed');
      }
    }

    this.validateValue(field, value);

    const pending = await this.prisma.clientFieldChange.findFirst({
      where: { clientId: client.id, field, status: 'PENDING_VERIFICATION' },
    });
    if (pending) {
      throw new ConflictException({
        code: 'VERIFICATION_REQUIRED',
        detail: 'Complete the pending verification for this field first',
        changeId: pending.id,
      });
    }

    const cooldownMs = cooldownForField(field);
    if (cooldownMs !== null) {
      const last = await this.prisma.clientFieldChange.findFirst({
        where: {
          clientId: client.id,
          field,
          status: 'APPROVED',
          appliedAt: { not: null },
        },
        orderBy: { appliedAt: 'desc' },
      });
      if (last?.appliedAt) {
        const retryAt = new Date(last.appliedAt.getTime() + cooldownMs);
        if (retryAt.getTime() > Date.now()) {
          throw new ConflictException({
            code: 'COOLDOWN_ACTIVE',
            retryAt: retryAt.toISOString(),
          });
        }
      }
    }

    return this.applyOrStage({ client, field, value, actorUserId, source });
  }

  /** Branch by field: immediate apply vs staged verification. */
  private async applyOrStage(params: {
    client: Client;
    field: ClientField;
    value: string | null;
    actorUserId: string;
    source: 'AGENCY' | 'CLIENT';
  }): Promise<FieldChangeResult> {
    const { client, field, value, actorUserId, source } = params;
    const now = new Date();

    if (field === ClientField.DIRECT_EMAIL) {
      const rawToken = randomBytes(32).toString('hex');
      const change = await this.prisma.clientFieldChange.create({
        data: {
          clientId: client.id,
          field,
          newValue: value,
          requestedByUserId: actorUserId,
          verificationTokenHash: sha256Hex(rawToken),
          verificationExpiresAt: new Date(
            now.getTime() + FIELD_VERIFICATION_TTL_MS,
          ),
        },
      });
      // Gated dev-log delivery only (BOOT_ARTIFACTS); the raw token is
      // never persisted and never returned through the API.
      this.maybeLogNewValueVerification(
        `new-email verification for ${value ?? ''}`,
        rawToken,
      );
      await this.clientsService.recordEvent(
        client.id,
        actorUserId,
        'client.field_change.requested',
        { field, source },
      );
      return { status: 'PENDING_VERIFICATION', field, changeId: change.id };
    }

    if (field === ClientField.DIRECT_MOBILE) {
      const change = await this.prisma.clientFieldChange.create({
        data: {
          clientId: client.id,
          field,
          newValue: value,
          requestedByUserId: actorUserId,
        },
      });
      await this.mobileVerification.issueVerificationToken(
        client.id,
        actorUserId,
      );
      await this.clientsService.recordEvent(
        client.id,
        actorUserId,
        'client.field_change.requested',
        { field, source },
      );
      return { status: 'PENDING_VERIFICATION', field, changeId: change.id };
    }

    // NAME (re-auth only, locked) and all non-security fields: apply now.
    await this.applyValue(client.id, field, value);
    await this.prisma.clientFieldChange.create({
      data: {
        clientId: client.id,
        field,
        newValue: value,
        status: 'APPROVED',
        requestedByUserId: actorUserId,
        approvedAt: now,
        appliedAt: now,
        verifiedAt: SECURITY_CONTROLLED_FIELDS.has(field) ? now : undefined,
      },
    });
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'client.updated',
      { field, source },
    );
    return { status: 'APPLIED', field };
  }

  /**
   * Second step for staged changes (DIRECT_EMAIL / DIRECT_MOBILE): verify
   * the new value, then apply. Fails closed on invalid/expired tokens.
   */
  async verifyFieldChange(
    client: Client,
    changeId: string,
    token: string,
    actorUserId: string,
  ): Promise<FieldChangeResult> {
    const change = await this.prisma.clientFieldChange.findFirst({
      where: { id: changeId, clientId: client.id },
    });
    if (!change) throw new NotFoundException('Field change not found');
    if (change.status !== 'PENDING_VERIFICATION') {
      throw new ConflictException({
        code: 'INVALID_FIELD_CHANGE_STATE',
        detail: 'Field change is not pending verification',
      });
    }
    if (
      change.verificationExpiresAt &&
      change.verificationExpiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.clientFieldChange.update({
        where: { id: change.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException({ code: 'VERIFICATION_EXPIRED' });
    }

    if (change.field === ClientField.DIRECT_EMAIL) {
      if (
        !change.verificationTokenHash ||
        sha256Hex(token) !== change.verificationTokenHash
      ) {
        throw new BadRequestException({ code: 'VERIFICATION_INVALID' });
      }
    } else if (change.field === ClientField.DIRECT_MOBILE) {
      const consumed = await this.mobileVerification.consumeVerificationToken(
        client.id,
        token,
      );
      if (consumed.outcome !== 'CONSUMED') {
        throw new BadRequestException({
          code: 'VERIFICATION_INVALID',
          detail: consumed.outcome,
        });
      }
    } else {
      throw new BadRequestException({
        code: 'VERIFICATION_NOT_REQUIRED',
        detail: 'Field does not require verification',
      });
    }

    const now = new Date();
    await this.applyValue(client.id, change.field, change.newValue);
    await this.prisma.clientFieldChange.update({
      where: { id: change.id },
      data: {
        status: 'APPROVED',
        verifiedAt: now,
        approvedAt: now,
        appliedAt: now,
      },
    });
    await this.clientsService.recordEvent(
      client.id,
      actorUserId,
      'client.updated',
      { field: change.field, verified: true },
    );
    return { status: 'APPLIED', field: change.field };
  }

  /** Per-field value validation (approved contracts only). */
  private validateValue(field: ClientField, value: string | null): void {
    if (field === ClientField.CLIENT_TYPE) {
      const parsed = z.enum(['INDIVIDUAL', 'BUSINESS']).safeParse(value);
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'INVALID_FIELD_VALUE',
          detail: 'CLIENT_TYPE must be INDIVIDUAL or BUSINESS',
        });
      }
      return;
    }
    if (field === ClientField.INDUSTRY && value !== null) {
      const parsed = industrySchema.safeParse(value);
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'INVALID_FIELD_VALUE',
          detail: 'INDUSTRY must be one of the approved values',
        });
      }
      return;
    }
    if (field === ClientField.DIRECT_EMAIL && value !== null) {
      const parsed = z.string().email().max(200).safeParse(value);
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'INVALID_FIELD_VALUE',
          detail: 'DIRECT_EMAIL must be a valid email address',
        });
      }
    }
  }

  /** Map a ClientField + value to the Prisma update payload. */
  private buildUpdateData(
    field: ClientField,
    value: string | null,
  ): Record<string, unknown> {
    if (field === ClientField.ADDRESS) {
      if (value === null) {
        return {
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          country: null,
          postalCode: null,
        };
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(value) as Record<string, unknown>;
      } catch {
        throw new BadRequestException({
          code: 'INVALID_FIELD_VALUE',
          detail: 'ADDRESS must be a JSON object of address fields',
        });
      }
      const pick = (key: string): string | null =>
        typeof parsed[key] === 'string' ? (parsed[key] as string) : null;
      return {
        addressLine1: pick('addressLine1'),
        addressLine2: pick('addressLine2'),
        city: pick('city'),
        state: pick('state'),
        country: pick('country'),
        postalCode: pick('postalCode'),
      };
    }
    const column = FIELD_COLUMN_MAP[field];
    return { [column]: value };
  }

  private async applyValue(
    clientId: string,
    field: ClientField,
    value: string | null,
  ): Promise<void> {
    await this.prisma.client.update({
      where: { id: clientId },
      data: this.buildUpdateData(field, value),
    });
  }

  /** Gated local-development delivery ONLY (BOOT_ARTIFACTS mechanism). */
  private maybeLogNewValueVerification(
    label: string,
    rawToken: string,
  ): void {
    if (!isBootArtifactsAllowed(process.env)) {
      return;
    }
    this.logger.log(`[boot-artifact] ${label}: ${rawToken}`);
  }
}