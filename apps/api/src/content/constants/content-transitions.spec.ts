import { ContentStatus } from '@prisma/client';

import {
  CONTENT_STATUSES,
  CONTENT_STATUS_TRANSITIONS,
  CONTENT_TRANSITION_AUTHORITY,
  allowedTransitionsFor,
  canTransition,
  isEditOnlyTransition,
  mayActorPerform,
} from './content-transitions.js';

describe('Client Operations V1 Content status machine (LOCKED)', () => {
  it('covers exactly the Prisma ContentStatus enum', () => {
    expect(new Set(CONTENT_STATUSES)).toEqual(
      new Set(Object.values(ContentStatus)),
    );
    expect(new Set(Object.keys(CONTENT_STATUS_TRANSITIONS))).toEqual(
      new Set(Object.values(ContentStatus)),
    );
  });

  it('has no PUBLISHED status (publishing is still deferred)', () => {
    expect((CONTENT_STATUSES as readonly string[]).includes('PUBLISHED')).toBe(
      false,
    );
    expect((CONTENT_STATUSES as readonly string[]).includes('SCHEDULED')).toBe(
      false,
    );
  });

  it('permits exactly the approved transitions', () => {
    expect([...allowedTransitionsFor(ContentStatus.DRAFT)]).toEqual([
      ContentStatus.IN_REVIEW,
      ContentStatus.ARCHIVED,
    ]);
    expect([...allowedTransitionsFor(ContentStatus.IN_REVIEW)]).toEqual([
      ContentStatus.CHANGES_REQUESTED,
    ]);
    expect([...allowedTransitionsFor(ContentStatus.CHANGES_REQUESTED)]).toEqual([
      ContentStatus.IN_REVIEW,
      ContentStatus.ARCHIVED,
    ]);
    expect([...allowedTransitionsFor(ContentStatus.APPROVED)]).toEqual([
      ContentStatus.ARCHIVED,
    ]);
    expect([...allowedTransitionsFor(ContentStatus.ARCHIVED)]).toEqual([]);
  });

  it('rejects archiving while in review (decision D2)', () => {
    expect(
      canTransition(ContentStatus.IN_REVIEW, ContentStatus.ARCHIVED),
    ).toBe(false);
  });

  it('never allows APPROVED as a generic transition target', () => {
    for (const from of Object.values(ContentStatus)) {
      expect(canTransition(from, ContentStatus.APPROVED)).toBe(false);
    }
    // ...and the authority table has no APPROVED entry either, so
    // confirmFinal() really is the only door.
    const keys = Object.keys(CONTENT_TRANSITION_AUTHORITY);
    expect(keys.some((key) => key.endsWith('->APPROVED'))).toBe(false);
  });

  it('treats APPROVED -> DRAFT as an edit-only edge (D7)', () => {
    expect(
      isEditOnlyTransition(ContentStatus.APPROVED, ContentStatus.DRAFT),
    ).toBe(true);
    expect(
      isEditOnlyTransition(ContentStatus.DRAFT, ContentStatus.IN_REVIEW),
    ).toBe(false);
    // The revert edge is not a generic transition.
    expect(canTransition(ContentStatus.APPROVED, ContentStatus.DRAFT)).toBe(
      false,
    );
    expect(
      mayActorPerform(
        'AGENCY_ADMIN',
        ContentStatus.APPROVED,
        ContentStatus.DRAFT,
      ),
    ).toBe(false);
  });

  it('keeps review decisions client-owner only (D1)', () => {
    expect(
      mayActorPerform(
        'CLIENT_OWNER',
        ContentStatus.IN_REVIEW,
        ContentStatus.CHANGES_REQUESTED,
      ),
    ).toBe(true);
    expect(
      mayActorPerform(
        'AGENCY_ADMIN',
        ContentStatus.IN_REVIEW,
        ContentStatus.CHANGES_REQUESTED,
      ),
    ).toBe(false);
  });

  it('lets both actors submit and archive (D1a, D3)', () => {
    for (const actor of ['AGENCY_ADMIN', 'CLIENT_OWNER'] as const) {
      expect(
        mayActorPerform(actor, ContentStatus.DRAFT, ContentStatus.IN_REVIEW),
      ).toBe(true);
      expect(
        mayActorPerform(
          actor,
          ContentStatus.CHANGES_REQUESTED,
          ContentStatus.IN_REVIEW,
        ),
      ).toBe(true);
      expect(
        mayActorPerform(actor, ContentStatus.APPROVED, ContentStatus.ARCHIVED),
      ).toBe(true);
    }
  });

  it('declares authority for every allowed non-terminal transition', () => {
    for (const from of Object.values(ContentStatus)) {
      for (const to of allowedTransitionsFor(from)) {
        const key = `${from}->${to}`;
        expect(CONTENT_TRANSITION_AUTHORITY[key]).toBeDefined();
        expect(CONTENT_TRANSITION_AUTHORITY[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('is frozen (no runtime mutation of the locked matrix)', () => {
    expect(Object.isFrozen(CONTENT_STATUS_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(CONTENT_TRANSITION_AUTHORITY)).toBe(true);
    expect(Object.isFrozen(CONTENT_STATUSES)).toBe(true);
  });
});