import { createContentSchema } from './create-content.dto.js';
import { updateContentSchema } from './update-content.dto.js';
import { transitionContentSchema } from './transition-content.dto.js';
import { confirmFinalContentSchema } from './confirm-final.dto.js';
import { createRawDataSchema } from './raw-data.dto.js';

/**
 * Contract guards for Client Operations V1 Content/RawData payloads.
 *
 * The status machine and the confirmation triple are SERVER-owned, so these
 * contracts must not accept a status, a confirmation field, or a server-derived
 * hash. These assertions are the regression guard for that rule.
 */
describe('Content DTOs keep state server-owned', () => {
  it('accepts a minimal create payload', () => {
    expect(
      createContentSchema.safeParse({ title: 'T', body: 'B' }).success,
    ).toBe(true);
  });

  it.each(['status', 'finalConfirmedAt', 'finalConfirmedByUserId', 'finalConfirmedRevisionId', 'id', 'clientId'])(
    'rejects the server-owned create key %s',
    (key) => {
      expect(
        createContentSchema.safeParse({ title: 'T', body: 'B', [key]: 'x' })
          .success,
      ).toBe(false);
    },
  );

  it('rejects an empty body or title', () => {
    expect(createContentSchema.safeParse({ title: '', body: 'B' }).success).toBe(
      false,
    );
    expect(createContentSchema.safeParse({ title: 'T', body: '' }).success).toBe(
      false,
    );
  });

  it('accepts a partial edit and a supplied expectedRevision', () => {
    expect(updateContentSchema.safeParse({ title: 'T2' }).success).toBe(true);
    expect(
      updateContentSchema.safeParse({ body: 'B2', expectedRevision: 3 }).success,
    ).toBe(true);
  });

  it('rejects an edit with no text change or a server-owned key', () => {
    expect(updateContentSchema.safeParse({}).success).toBe(false);
    expect(updateContentSchema.safeParse({ expectedRevision: 2 }).success).toBe(
      false,
    );
    expect(
      updateContentSchema.safeParse({ body: 'B2', status: 'APPROVED' }).success,
    ).toBe(false);
  });

  it('excludes APPROVED and DRAFT from the generic transition targets', () => {
    expect(transitionContentSchema.safeParse({ to: 'APPROVED' }).success).toBe(
      false,
    );
    expect(transitionContentSchema.safeParse({ to: 'DRAFT' }).success).toBe(
      false,
    );
    expect(
      transitionContentSchema.safeParse({ to: 'IN_REVIEW' }).success,
    ).toBe(true);
    expect(
      transitionContentSchema.safeParse({ to: 'CHANGES_REQUESTED', note: 'x' })
        .success,
    ).toBe(true);
  });

  it('keeps the final-confirmation payload to an optional note', () => {
    expect(confirmFinalContentSchema.safeParse({}).success).toBe(true);
    expect(confirmFinalContentSchema.safeParse({ note: 'ok' }).success).toBe(
      true,
    );
    expect(
      confirmFinalContentSchema.safeParse({ finalConfirmedAt: 'now' }).success,
    ).toBe(false);
  });
});

describe('RawData DTO keeps the hash server-computed', () => {
  it('accepts text and metadata intake', () => {
    expect(
      createRawDataSchema.safeParse({
        source: 'CLIENT_FORM',
        extractedText: 'brief',
        metadata: { channel: 'instagram' },
      }).success,
    ).toBe(true);
  });

  it('accepts an optional same-client contentId', () => {
    expect(
      createRawDataSchema.safeParse({
        source: 'AGENCY_UPLOAD',
        contentId: '33333333-3333-4333-8333-333333333333',
      }).success,
    ).toBe(true);
  });

  it.each(['contentHash', 'storageRef', 'clientId', 'capturedAt'])(
    'rejects the server-owned key %s',
    (key) => {
      expect(
        createRawDataSchema.safeParse({
          source: 'CLIENT_UPLOAD',
          extractedText: 'x',
          [key]: 'y',
        }).success,
      ).toBe(false);
    },
  );

  it('rejects an unknown source value', () => {
    expect(
      createRawDataSchema.safeParse({ source: 'SOMETHING_ELSE' }).success,
    ).toBe(false);
  });
});