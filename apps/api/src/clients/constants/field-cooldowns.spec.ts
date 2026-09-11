import { ClientField } from '@prisma/client';

import {
  FIELD_COOLDOWNS_MS,
  ONE_DAY_MS,
  ONE_HOUR_MS,
  cooldownForField,
  hasCooldown,
} from './field-cooldowns.js';

describe('Client V1 field cooldown table (LOCKED)', () => {
  it('covers exactly the twelve approved ClientField entries', () => {
    expect(new Set(Object.keys(FIELD_COOLDOWNS_MS))).toEqual(
      new Set(Object.values(ClientField)),
    );
    expect(Object.keys(FIELD_COOLDOWNS_MS)).toHaveLength(12);
  });

  it('enforces the exact approved 30-day cooldowns', () => {
    expect(FIELD_COOLDOWNS_MS.NAME).toBe(30 * ONE_DAY_MS);
    expect(FIELD_COOLDOWNS_MS.DIRECT_EMAIL).toBe(30 * ONE_DAY_MS);
    expect(FIELD_COOLDOWNS_MS.DIRECT_MOBILE).toBe(30 * ONE_DAY_MS);
    expect(FIELD_COOLDOWNS_MS.CLIENT_TYPE).toBe(30 * ONE_DAY_MS);
  });

  it('enforces the exact approved 7-day cooldowns', () => {
    expect(FIELD_COOLDOWNS_MS.WEBSITE).toBe(7 * ONE_DAY_MS);
    expect(FIELD_COOLDOWNS_MS.ADDRESS).toBe(7 * ONE_DAY_MS);
    expect(FIELD_COOLDOWNS_MS.INDUSTRY).toBe(7 * ONE_DAY_MS);
  });

  it('enforces the exact approved 24-hour cooldowns', () => {
    expect(FIELD_COOLDOWNS_MS.DESCRIPTION).toBe(24 * ONE_HOUR_MS);
    expect(FIELD_COOLDOWNS_MS.LOGO_AVATAR).toBe(24 * ONE_HOUR_MS);
  });

  it('gives NOTES no cooldown', () => {
    expect(FIELD_COOLDOWNS_MS.NOTES).toBeNull();
    expect(hasCooldown(ClientField.NOTES)).toBe(false);
  });

  it('gives Primary Contact fields NO cooldown (approved decision D2)', () => {
    expect(FIELD_COOLDOWNS_MS.PRIMARY_CONTACT_NAME).toBeNull();
    expect(FIELD_COOLDOWNS_MS.PRIMARY_CONTACT_MOBILE).toBeNull();
    expect(hasCooldown(ClientField.PRIMARY_CONTACT_NAME)).toBe(false);
    expect(hasCooldown(ClientField.PRIMARY_CONTACT_MOBILE)).toBe(false);
  });

  it('exposes the table through cooldownForField consistently', () => {
    expect(cooldownForField(ClientField.NAME)).toBe(30 * ONE_DAY_MS);
    expect(cooldownForField(ClientField.NOTES)).toBeNull();
    expect(cooldownForField(ClientField.PRIMARY_CONTACT_NAME)).toBeNull();
  });

  it('is frozen (no runtime mutation of the locked table)', () => {
    expect(Object.isFrozen(FIELD_COOLDOWNS_MS)).toBe(true);
  });
});