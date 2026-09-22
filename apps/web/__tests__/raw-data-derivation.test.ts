/**
 * P1 rules-only derivation contracts (simplified text-first request flow).
 *
 * These assert ENGINE behaviour only:
 *   - deterministic (same story -> same result);
 *   - no fabrication (unknown input derives nothing);
 *   - existing metadata key vocabulary only (no new/renamed keys);
 *   - honest confidence (unknown/ambiguous -> a question, never silent data).
 *
 * The question count is asserted against the exported
 * PROVISIONAL_QUESTION_GROUP_LIMIT / PROVISIONAL_ASK_POLICY constants, never
 * against a hard-coded number: the clarification policy is PROVISIONAL UX
 * behaviour that D6/D9 replace in P2, so these tests must not freeze it as a
 * business invariant.
 */
import {
  describeFieldValue,
  deriveRawDataFromStory,
  FIELD_META,
  PROVISIONAL_ASK_POLICY,
  PROVISIONAL_QUESTION_GROUP_LIMIT,
  PROVISIONAL_STORY_MAX_LENGTH,
} from '@/lib/raw-data-derivation';
import { rawDataRequestSchema } from '@/types/raw-data';

const LEGACY_KEYS = Object.keys(rawDataRequestSchema.shape);

describe('deriveRawDataFromStory (rules-only)', () => {
  it('derives confident values from a clear story', () => {
    const result = deriveRawDataFromStory(
      'Please create a reel for Instagram and Facebook about our Diwali discount offer, in Hindi.',
    );

    expect(result.values.contentType).toBe('Reel');
    expect(result.values.contentPurpose).toBe('Promotion');
    expect(result.values.campaignOccasion).toBe('Diwali');
    expect(result.values.language).toEqual(['Hindi']);
    expect(result.values.platform).toEqual(['Instagram', 'Facebook']);

    const understoodKeys = result.understood.map((field) => field.key);
    expect(understoodKeys).toContain('contentType');
    expect(understoodKeys).toContain('contentPurpose');
    expect(understoodKeys).toContain('language');

    // Several platforms is legitimate but must be shown for checking.
    expect(result.toCheck.map((field) => field.key)).toContain('platform');

    // Nothing we are already confident about is asked again.
    expect(result.questions.map((question) => question.key)).not.toContain('language');
  });

  it('is deterministic - the same story always derives the same result', () => {
    const story =
      'Diwali offer poster for Instagram, 20% off, women customers, Hindi, urgent.';
    const first = deriveRawDataFromStory(story);
    const second = deriveRawDataFromStory(story);
    expect(second).toEqual(first);
  });

  it('never fabricates: an unsupported story derives nothing and asks instead', () => {
    const result = deriveRawDataFromStory('hello');

    expect(result.understood).toHaveLength(0);
    expect(Object.keys(result.values)).toHaveLength(0);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions.length).toBeLessThanOrEqual(PROVISIONAL_QUESTION_GROUP_LIMIT);
  });

  it('keeps low-confidence guesses out of the submitted values', () => {
    const result = deriveRawDataFromStory('We want a story about our new service.');

    // "story" is only a weak format signal -> asked, never silently stored.
    expect(result.values.contentType).toBeUndefined();
    const contentTypeQuestion = result.questions.find(
      (question) => question.key === 'contentType',
    );
    expect(contentTypeQuestion).toBeDefined();
    expect(contentTypeQuestion?.suggestedValue).toBe('Story');
  });

  it('feeds the confidence buckets from the same detection pass', () => {
    const result = deriveRawDataFromStory('Something for our shop.');
    expect(result.understood).toHaveLength(0);
    expect(result.toCheck.map((field) => field.key)).toContain('topic');
  });

  it('never emits keys for data it cannot evidence (dates, prices, venues)', () => {
    const result = deriveRawDataFromStory(
      'Diwali event on 12/11/2026 at our store, tickets 500 rupees.',
    );
    const keys = Object.keys(result.values);
    expect(keys).not.toContain('eventDate');
    expect(keys).not.toContain('psPrice');
    expect(keys).not.toContain('venue');
  });

  it('only ever uses metadata keys that already exist in the legacy schema', () => {
    const result = deriveRawDataFromStory(
      'Reel for Instagram about Diwali offer for women in Hindi, urgent, see https://example.com/brief',
    );
    const keys = Object.keys(result.values);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(LEGACY_KEYS).toContain(key);
    for (const meta of FIELD_META) expect(LEGACY_KEYS).toContain(meta.key);
  });

  it('trims the story and keeps it as the single text payload', () => {
    expect(deriveRawDataFromStory('   Diwali offer for Instagram   ').story).toBe(
      'Diwali offer for Instagram',
    );
    expect(PROVISIONAL_STORY_MAX_LENGTH).toBeGreaterThan(0);
  });

  it('caps questions with the PROVISIONAL limit and the PROVISIONAL ask list', () => {
    const result = deriveRawDataFromStory('hello');
    const askable = PROVISIONAL_ASK_POLICY.map((entry) => entry.key);
    expect(result.questions.length).toBeLessThanOrEqual(PROVISIONAL_QUESTION_GROUP_LIMIT);
    for (const question of result.questions) expect(askable).toContain(question.key);
  });

  it('renders multi values readably', () => {
    expect(describeFieldValue(['Instagram', 'Facebook'])).toBe('Instagram, Facebook');
    expect(describeFieldValue('Reel')).toBe('Reel');
    expect(describeFieldValue(undefined)).toBe('');
  });
});
