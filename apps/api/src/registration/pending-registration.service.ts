import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import type { PendingRegistration } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

import { PENDING_TTL_HOURS } from './constants/registration.constants.js';

/**
 * PendingRegistration lifecycle primitives (Registration Phase v1.0).
 *
 * Responsibilities:
 *   - resume-token generation / SHA-256 hashing (OPEN-1: only the hash
 *     is ever persisted; raw tokens live only in responses/links)
 *   - in-place rotation of the SINGLE resume credential (D1-A) - never
 *     touches createdAt/expiresAt, never creates a second credential
 *   - lazy expiry (mandatory, L3/OPEN-7): every stage touch checks
 *     expiresAt; an expired row is hard-deleted (OTP rows cascade, the
 *     resume token dies with the row, temporary sensitive registration
 *     data is removed) and the caller sees "not found"
 *   - timer invariants: createdAt/expiresAt are computed once and never
 *     reset by resume or pre-completion edits (L6/OPEN-9)
 */

/** SHA-256 hex of a raw resume token (only representation ever stored). */
export function hashResumeToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** New cryptographically random raw resume token (32 bytes, base64url). */
export function generateResumeToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class PendingRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  /** createdAt + 72h. Computed once at creation; never recomputed. */
  computeExpiresAt(createdAt: Date): Date {
    return new Date(createdAt.getTime() + PENDING_TTL_HOURS * 60 * 60 * 1000);
  }

  isExpired(pending: { expiresAt: Date }, now: Date = new Date()): boolean {
    return now.getTime() >= pending.expiresAt.getTime();
  }

  /**
   * Lazy expiry hard-delete: removes the row (cascade deletes OTPs;
   * temp sensitive data - name/phone/discovery snapshot - is gone; the
   * resumeTokenHash dies with the row so any outstanding link/token is
   * invalid). Idempotent.
   */
  async deleteExpired(pending: { id: string }): Promise<void> {
    try {
      await this.prisma.pendingRegistration.delete({ where: { id: pending.id } });
    } catch {
      // Already deleted concurrently - the caller's outcome (not found)
      // is unchanged.
    }
  }

  /** Load by raw token; applies lazy expiry (expired -> delete + null). */
  async loadAliveByToken(rawToken: string): Promise<PendingRegistration | null> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { resumeTokenHash: hashResumeToken(rawToken) },
    });
    if (!pending) return null;
    if (this.isExpired(pending)) {
      await this.deleteExpired(pending);
      return null;
    }
    return pending;
  }

  /** Load by id; applies lazy expiry. */
  async loadAliveById(id: string): Promise<PendingRegistration | null> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id },
    });
    if (!pending) return null;
    if (this.isExpired(pending)) {
      await this.deleteExpired(pending);
      return null;
    }
    return pending;
  }

  /** Load by primary identity (email); applies lazy expiry. */
  async loadAliveByEmail(email: string): Promise<PendingRegistration | null> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email },
    });
    if (!pending) return null;
    if (this.isExpired(pending)) {
      await this.deleteExpired(pending);
      return null;
    }
    return pending;
  }

  /**
   * Rotate the SINGLE resume credential IN PLACE (D1-A).
   *
   * Generates a new random raw token, persists ONLY its SHA-256 over the
   * previous hash (the old raw token is immediately invalid), and returns
   * the new raw token for embedding in the current delivery (reminder
   * resume link, or repeat-/start response).
   *
   * Explicitly updates ONLY resumeTokenHash: createdAt and expiresAt are
   * never modified by rotation. No second credential field exists.
   */
  async rotateResumeToken(id: string): Promise<string> {
    const rawToken = generateResumeToken();
    await this.prisma.pendingRegistration.update({
      where: { id },
      data: { resumeTokenHash: hashResumeToken(rawToken) },
    });
    return rawToken;
  }
}
