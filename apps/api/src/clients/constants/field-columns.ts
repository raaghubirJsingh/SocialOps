import type { ClientField } from '@prisma/client';

/**
 * Maps each ClientField to the Client column(s) it writes. Kept beside the
 * cooldown table so the field-change pipeline has a single source of truth.
 */
export const FIELD_COLUMN_MAP: Readonly<Record<ClientField, string>> =
  Object.freeze({
    NAME: 'name',
    DIRECT_EMAIL: 'directEmail',
    DIRECT_MOBILE: 'directPhone',
    PRIMARY_CONTACT_NAME: 'primaryContactName',
    PRIMARY_CONTACT_MOBILE: 'primaryContactPhone',
    WEBSITE: 'website',
    ADDRESS: 'address',
    DESCRIPTION: 'description',
    INDUSTRY: 'industry',
    CLIENT_TYPE: 'type',
    LOGO_AVATAR: 'logoUrl',
    NOTES: 'notes',
  });

/**
 * Locked security-controlled fields (ACT-1/ACT-2 decisions): changes
 * require re-authentication (security check). DIRECT_EMAIL additionally
 * requires new-email verification; DIRECT_MOBILE requires mobile
 * verification. NAME requires re-auth only (locked Gate 4).
 */
export const SECURITY_CONTROLLED_FIELDS: ReadonlySet<ClientField> = new Set([
  'NAME',
  'DIRECT_EMAIL',
  'DIRECT_MOBILE',
] as ClientField[]);