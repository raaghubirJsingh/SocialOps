/**
 * R1 correction-persistence contracts (PURE state logic; node environment).
 *
 * Covers the approved R1 remediation:
 *   - composeValues: derivation values + client overrides (overrides win,
 *     explicit clears representable, foreign keys rejected, low-confidence
 *     suggestions never pre-submitted);
 *   - applyFreshDerivation (the approved staleness rule): an override for key
 *     K survives a story-triggered re-derivation only while K's derivation is
 *     unchanged; a changed derivation makes the new story-derived value stand;
 *   - sanitizeOverrides: draft/legacy mapping (old drafts without `overrides`
 *     load safely; foreign keys and malformed values are dropped).
 *
 * The Back -> Continue case (unchanged story) never re-runs derivation in the
 * component, so it is expressed here as the merge over two derivations of the
 * SAME story (deterministic engine => identical results => overrides kept).
 */
import { deriveRawDataFromStory, type DerivationResult } from '@/lib/raw-data-derivation';
import {
  applyFreshDerivation,
  composeValues,
  isValidMetadataKey,
  sanitizeOverrides,
} from '@/lib/raw-data-request-state';

const STORY_A =
  'Please create a reel for Instagram and Facebook about our Diwali discount offer, in Hindi.';
const STORY_A_UNRELATED_EDIT =
  'Please create a reel for Instagram and Facebook about our Diwali discount offer, in Hindi. Our shop is in the city centre.';
const STORY_B_PLATFORM_EDIT =
  'Please create a reel for Instagram about our Diwali discount offer, in Hindi.';
const STORY_B_TYPE_EDIT =
  'Please create a poster for Instagram and Facebook about our Diwali discount offer, in Hindi.';
const STORY_C_LOW_CONFIDENCE = 'We want a story about our new service.';

function deriveOf(story: string): DerivationResult {
  return deriveRawDataFromStory(story);
}

describe('composeValues (derivation + overrides)', () => {
  it('mirrors the derivation values when there are no overrides', () => {
    const derivation = deriveOf(STORY_A);
    expect(composeValues(derivation, {})).toEqual(derivation.values);
  });

  it('gives overrides precedence over derived values', () => {
    const derivation = deriveOf(STORY_A);
    const composed = composeValues(derivation, { contentType: 'Poster' });
    expect(composed.contentType).toBe('Poster');
    expect(composed.language).toEqual(derivation.values.language);
    expect(composed.contentPurpose).toBe(derivation.values.contentPurpose);
  });

  it('represents explicit clears (empty string / empty array)', () => {
    const composed = composeValues(deriveOf(STORY_A), { platform: [], tone: '' });
    expect(composed.platform).toEqual([]);
    expect(composed.tone).toBe('');
  });

  it('never pre-submits low-confidence suggestions', () => {
    // "story" is only a weak signal in STORY_C: low confidence => NOT in values.
    const derivation = deriveOf(STORY_C_LOW_CONFIDENCE);
    expect(derivation.values.contentType).toBeUndefined();
    expect(composeValues(derivation, {}).contentType).toBeUndefined();
  });

  it('treats a low-confidence question answer as an explicit override', () => {
    const composed = composeValues(deriveOf(STORY_C_LOW_CONFIDENCE), {
      contentType: 'Story',
    });
    expect(composed.contentType).toBe('Story');
  });

  it('rejects foreign metadata keys', () => {
    const composed = composeValues(deriveOf(STORY_A), {
      notARealKey: 'injected',
    } as never);
    expect(Object.keys(composed)).not.toContain('notARealKey');
    for (const key of Object.keys(composed)) {
      expect(isValidMetadataKey(key)).toBe(true);
    }
  });
});

describe('applyFreshDerivation (approved staleness rule)', () => {
  it('keeps overrides when the story is unchanged (Back -> Continue)', () => {
    const previous = deriveOf(STORY_A);
    const next = deriveOf(STORY_A); // deterministic => identical values
    const overrides = { contentType: 'Poster', language: 'English' };
    expect(applyFreshDerivation(previous, next, overrides)).toEqual(overrides);
  });

  it('keeps overrides for keys untouched by an unrelated story edit', () => {
    const previous = deriveOf(STORY_A);
    const next = deriveOf(STORY_A_UNRELATED_EDIT);
    const overrides = { contentType: 'Poster', priority: 'Urgent' };
    expect(applyFreshDerivation(previous, next, overrides)).toEqual(overrides);
  });

  it('drops only the overrides whose derivation changed', () => {
    const previous = deriveOf(STORY_A);
    const next = deriveOf(STORY_B_TYPE_EDIT); // contentType Reel -> Poster
    const overrides = { contentType: 'Poster', language: 'English', campaignOccasion: 'Holi' };
    // contentType derivation changed => dropped; language and occasion did
    // not change => kept.
    expect(applyFreshDerivation(previous, next, overrides)).toEqual({
      language: 'English',
      campaignOccasion: 'Holi',
    });
  });

  it('drops overrides for keys whose derivation disappears (story edit removes them)', () => {
    const previous = deriveOf(STORY_A);
    const next = deriveOf(STORY_B_PLATFORM_EDIT); // Facebook removed
    const overrides = { contentType: 'Poster', platform: ['Instagram', 'Facebook'] };
    const kept = applyFreshDerivation(previous, next, overrides);
    expect(kept.contentType).toBe('Poster'); // Reel -> Reel: unchanged
    expect(kept.platform).toBeUndefined(); // changed => new story value stands
  });

  it('keeps a low-confidence question answer while the key stays underived', () => {
    const previous = deriveOf(STORY_C_LOW_CONFIDENCE);
    const next = deriveOf(STORY_C_LOW_CONFIDENCE);
    expect(applyFreshDerivation(previous, next, { contentType: 'Story' })).toEqual({
      contentType: 'Story',
    });
  });

  it('keeps an override for a key the engine never derives (gaps stay client-owned)', () => {
    const previous = deriveOf(STORY_A); // tone is not derived here
    const next = deriveOf(STORY_A_UNRELATED_EDIT);
    expect(applyFreshDerivation(previous, next, { tone: 'Professional' })).toEqual({
      tone: 'Professional',
    });
  });

  it('starts fresh (no overrides) when there is no previous derivation (Case C)', () => {
    const next = deriveOf(STORY_A);
    expect(applyFreshDerivation(null, next, { contentType: 'Poster' })).toEqual({});
  });
});



describe('sanitizeOverrides (draft / old-draft mapping)', () => {
  it('round-trips overrides through a save/load cycle without loss', () => {
    const derivation = deriveOf(STORY_A);
    const overrides = { contentType: 'Poster', platform: ['Instagram'] };
    const before = composeValues(derivation, overrides);
    const restored = sanitizeOverrides(overrides);
    expect(composeValues(derivation, restored)).toEqual(before);
  });

  it('maps an old draft without overrides (composed values) safely', () => {
    const oldDraftValues = {
      contentType: 'Reel',
      platform: 'Instagram, Facebook', // legacy packing joins arrays
      notARealKey: 'injected',
      badArray: [1, 2],
    };
    const overrides = sanitizeOverrides(oldDraftValues);
    expect(overrides.contentType).toBe('Reel');
    expect(overrides.platform).toBe('Instagram, Facebook');
    expect(Object.keys(overrides)).not.toContain('notARealKey');
    expect(Object.keys(overrides)).not.toContain('badArray');
  });

  it('accepts undefined / null input', () => {
    expect(sanitizeOverrides(undefined)).toEqual({});
    expect(sanitizeOverrides(null)).toEqual({});
  });
});

describe('isValidMetadataKey', () => {
  it('accepts existing RawData metadata keys only', () => {
    expect(isValidMetadataKey('platform')).toBe(true);
    expect(isValidMetadataKey('contentType')).toBe(true);
    expect(isValidMetadataKey('notARealKey')).toBe(false);
  });
});
