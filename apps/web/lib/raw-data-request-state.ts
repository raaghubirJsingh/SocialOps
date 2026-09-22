/**
 * R1 - Correction persistence state logic for the simplified (text-first)
 * request flow. PURE functions only (no React, no DOM, no I/O) so the rules
 * run in the existing node Jest environment.
 *
 * Approved R1 behaviour:
 * - derivation runs only on first entry to Screen 2 or when the story text
 *   actually changes (Back -> Continue with an unchanged story never re-derives);
 * - a client correction is the value of record for its key: overrides win over
 *   derived values, including explicit clears (empty string / empty array);
 * - staleness rule: when a story edit DOES trigger re-derivation, an override
 *   for key K survives only if nextDerivation.values[K] deep-equals
 *   previousDerivation.values[K]; if the derivation changed, the new
 *   story-derived value becomes authoritative and the client can correct it
 *   again on Screen 2;
 * - low-confidence values are never part of derivation.values, so answering a
 *   question always creates an explicit override (a suggestion is never
 *   pre-submitted);
 * - only EXISTING RawData metadata keys (RawDataMetadataKey) may enter the
 *   composed values - the payload vocabulary is unchanged.
 *
 * No backend/contract change: composed values are packed by the existing
 * `packCreateRawDataRequest` exactly as before.
 */

import {
  FIELD_META,
  type DerivationResult,
  type RawDataMetadataKey,
} from '@/lib/raw-data-derivation';

/**
 * A single metadata value as carried by the flow. Same shape the flow already
 * used (re-exported by `understanding-step.tsx` for compatibility).
 */
export type FieldValue = string | string[];

/**
 * Client corrections keyed by EXISTING metadata keys. Sparse by design (a
 * Partial over the key union), so only valid keys can ever be present.
 */
export type Overrides = Partial<Record<RawDataMetadataKey, FieldValue>>;

const VALID_KEYS: ReadonlySet<string> = new Set(FIELD_META.map((meta) => meta.key));

/** Guard: only existing RawData metadata keys may enter composed values. */
export function isValidMetadataKey(key: string): key is RawDataMetadataKey {
  return VALID_KEYS.has(key);
}

/** Structural equality for `FieldValue` (string, or arrays element-wise). */
function fieldValuesEqual(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return a === b;
}

/**
 * Derivation values + client overrides. Overrides win (including explicit
 * clears: '' for single, [] for multi, which the existing packing helper then
 * omits from `metadata`). Foreign keys are rejected.
 */
export function composeValues(
  derivation: DerivationResult | null,
  overrides: Overrides,
): Record<string, FieldValue> {
  const composed: Record<string, FieldValue> = {};
  if (derivation) {
    for (const [key, value] of Object.entries(derivation.values)) {
      if (isValidMetadataKey(key)) composed[key] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || !isValidMetadataKey(key)) continue;
    composed[key] = value;
  }
  return composed;
}

/**
 * Apply the approved staleness rule after a story edit triggered
 * re-derivation. With no previous derivation the flow starts fresh with no
 * overrides (approved Case C).
 */
export function applyFreshDerivation(
  previous: DerivationResult | null,
  next: DerivationResult,
  overrides: Overrides,
): Overrides {
  if (!previous) return {};
  const kept: Overrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || !isValidMetadataKey(key)) continue;
    if (fieldValuesEqual(previous.values[key], next.values[key])) {
      kept[key] = value;
    }
    // else: dropped - the story change made this key's derivation differ, so
    // the new story-derived value stands (the client can re-correct it).
  }
  return kept;
}

/**
 * Draft mapping (accepted shapes only): string / string[] values keyed by
 * existing RawData metadata keys; anything else is dropped. Old simple-flow
 * drafts stored the composed `values` map - mapping it to overrides is
 * harmless because the composed values merely re-assert the same values.
 */
export function sanitizeOverrides(
  input: Record<string, unknown> | undefined | null,
): Overrides {
  const result: Overrides = {};
  if (!input) return result;
  for (const [key, value] of Object.entries(input)) {
    if (!isValidMetadataKey(key)) continue;
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = value;
    }
  }
  return result;
}
