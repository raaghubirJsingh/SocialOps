import type { ClientField } from '@prisma/client';

/**
 * Exact approved Client Module V1 field-change cooldown table (LOCKED).
 *
 * Source: the approved Client Module V1 business requirements plus the
 * ACT-1 decision D2. Do NOT invent additional cooldowns and do NOT
 * duplicate these values at call sites - later API/frontend code imports
 * from this module so the approved table exists in exactly one place
 * (the Prisma schema comment for `ClientField` points here).
 *
 * `null` means NO cooldown:
 *   - NOTES: approved as no-cooldown.
 *   - PRIMARY_CONTACT_NAME / PRIMARY_CONTACT_MOBILE: approved decision D2 -
 *     no cooldown. (Whether Primary Contact fields should ever carry a
 *     cooldown was left OPEN; it is resolved to "none" for V1.)
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const ONE_HOUR_MS = MS_PER_HOUR;
export const ONE_DAY_MS = MS_PER_DAY;

export const FIELD_COOLDOWNS_MS: Readonly<Record<ClientField, number | null>> =
  Object.freeze({
    NAME: 30 * MS_PER_DAY,
    DIRECT_EMAIL: 30 * MS_PER_DAY,
    DIRECT_MOBILE: 30 * MS_PER_DAY,
    // D2: Primary Contact fields carry NO cooldown.
    PRIMARY_CONTACT_NAME: null,
    PRIMARY_CONTACT_MOBILE: null,
    WEBSITE: 7 * MS_PER_DAY,
    ADDRESS: 7 * MS_PER_DAY,
    DESCRIPTION: 24 * MS_PER_HOUR,
    INDUSTRY: 7 * MS_PER_DAY,
    CLIENT_TYPE: 30 * MS_PER_DAY,
    LOGO_AVATAR: 24 * MS_PER_HOUR,
    NOTES: null,
  });

/** Approved cooldown for a field in milliseconds, or `null` when none. */
export function cooldownForField(field: ClientField): number | null {
  return FIELD_COOLDOWNS_MS[field] ?? null;
}

/** Whether the field is subject to the approved cooldown control. */
export function hasCooldown(field: ClientField): boolean {
  return cooldownForField(field) !== null;
}