import { ContentStatus } from '@prisma/client';

import {
  CHANGE_REQUEST_LOCKED_STATUSES,
  CONTENT_STATUSES,
  CONTENT_STATUS_TRANSITIONS,
  CONTENT_TRANSITION_AUTHORITY,
  IMMUTABLE_CONTENT_STATUSES,
  allowedTransitionsFor,
  canTransition,
  isChangeRequestLocked,
  isContentImmutable,
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
    // Phase 2 amendment: DRAFT additionally reaches AWAITING_MANAGER_APPROVAL,
    // the AI-draft-handover state of the approved 3-scenario pipeline. The V1
    // edges are unchanged.
    expect([...allowedTransitionsFor(ContentStatus.DRAFT)].sort()).toEqual(
      [
        ContentStatus.IN_REVIEW,
        ContentStatus.AWAITING_MANAGER_APPROVAL,
        ContentStatus.ARCHIVED,
      ].sort(),
    );
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

describe('Phase 2 Unified Content & AI Foundation workflow (3 scenarios)', () => {
  it('walks the AI pipeline DRAFT -> AWAITING_MANAGER_APPROVAL -> UNDER_CLIENT_REVIEW -> FINAL_CONFIRMED', () => {
    expect(
      canTransition(
        ContentStatus.DRAFT,
        ContentStatus.AWAITING_MANAGER_APPROVAL,
      ),
    ).toBe(true);
    expect(
      canTransition(
        ContentStatus.AWAITING_MANAGER_APPROVAL,
        ContentStatus.UNDER_CLIENT_REVIEW,
      ),
    ).toBe(true);
    expect(
      canTransition(
        ContentStatus.UNDER_CLIENT_REVIEW,
        ContentStatus.FINAL_CONFIRMED,
      ),
    ).toBe(true);
  });

  it('lets only the client owner send the item back for revision', () => {
    expect(
      mayActorPerform(
        'CLIENT_OWNER',
        ContentStatus.UNDER_CLIENT_REVIEW,
        ContentStatus.AWAITING_MANAGER_APPROVAL,
      ),
    ).toBe(true);
    expect(
      mayActorPerform(
        'AGENCY_ADMIN',
        ContentStatus.UNDER_CLIENT_REVIEW,
        ContentStatus.AWAITING_MANAGER_APPROVAL,
      ),
    ).toBe(false);
    // The Agency may not self-approve into the client-review state either:
    // AWAITING_MANAGER_APPROVAL -> UNDER_CLIENT_REVIEW IS the manager approval.
    expect(
      mayActorPerform(
        'CLIENT_OWNER',
        ContentStatus.AWAITING_MANAGER_APPROVAL,
        ContentStatus.UNDER_CLIENT_REVIEW,
      ),
    ).toBe(false);
  });

  it('keeps the Phase 2 pipeline out of APPROVED', () => {
    // APPROVED is the Client Operations V1 confirmation state; the Phase 2
    // pipeline terminates at FINAL_CONFIRMED instead. Neither Phase 2 status may
    // transition into APPROVED, and no authority entry may declare it.
    expect(
      allowedTransitionsFor(ContentStatus.AWAITING_MANAGER_APPROVAL),
    ).not.toContain(ContentStatus.APPROVED);
    expect(
      allowedTransitionsFor(ContentStatus.UNDER_CLIENT_REVIEW),
    ).not.toContain(ContentStatus.APPROVED);
    expect(
      allowedTransitionsFor(ContentStatus.FINAL_CONFIRMED),
    ).not.toContain(ContentStatus.APPROVED);
    expect(
      CONTENT_TRANSITION_AUTHORITY['UNDER_CLIENT_REVIEW->APPROVED'],
    ).toBeUndefined();
    expect(
      CONTENT_TRANSITION_AUTHORITY['AWAITING_MANAGER_APPROVAL->APPROVED'],
    ).toBeUndefined();
  });

  it('locks FINAL_CONFIRMED against every mutation but archiving', () => {
    expect(isContentImmutable(ContentStatus.FINAL_CONFIRMED)).toBe(true);
    expect(isContentImmutable(ContentStatus.ARCHIVED)).toBe(true);
    expect(isContentImmutable(ContentStatus.DRAFT)).toBe(false);
    expect(isContentImmutable(ContentStatus.UNDER_CLIENT_REVIEW)).toBe(false);
    // APPROVED is deliberately NOT immutable: rule D7 allows the edit revert.
    expect(isContentImmutable(ContentStatus.APPROVED)).toBe(false);
    // The only exit from the lock is archiving.
    expect([...allowedTransitionsFor(ContentStatus.FINAL_CONFIRMED)]).toEqual([
      ContentStatus.ARCHIVED,
    ]);
  });

  it('refuses change requests once the client has confirmed', () => {
    expect(isChangeRequestLocked(ContentStatus.FINAL_CONFIRMED)).toBe(true);
    expect(isChangeRequestLocked(ContentStatus.APPROVED)).toBe(true);
    expect(isChangeRequestLocked(ContentStatus.ARCHIVED)).toBe(true);
    expect(isChangeRequestLocked(ContentStatus.UNDER_CLIENT_REVIEW)).toBe(
      false,
    );
    expect(isChangeRequestLocked(ContentStatus.DRAFT)).toBe(false);
  });

  it('publishes the exact locked-status sets and freezes them', () => {
    // Both sets are exactly as approved - no extra status may be locked, and a
    // live-editable status may never be locked by accident.
    expect(new Set(IMMUTABLE_CONTENT_STATUSES)).toEqual(
      new Set([ContentStatus.FINAL_CONFIRMED, ContentStatus.ARCHIVED]),
    );
    expect(new Set(CHANGE_REQUEST_LOCKED_STATUSES)).toEqual(
      new Set([
        ContentStatus.APPROVED,
        ContentStatus.FINAL_CONFIRMED,
        ContentStatus.ARCHIVED,
      ]),
    );

    // The two sets agree everywhere except APPROVED, which still allows the
    // rule-D7 edit revert but accepts no new change requests.
    for (const status of Object.values(ContentStatus)) {
      if (isContentImmutable(status)) {
        expect(isChangeRequestLocked(status)).toBe(true);
      }
    }
    expect(IMMUTABLE_CONTENT_STATUSES).not.toContain(ContentStatus.APPROVED);
    expect(CHANGE_REQUEST_LOCKED_STATUSES).toContain(ContentStatus.APPROVED);
  });

  it('freezes the Phase 2 lock sets (no runtime mutation)', () => {
    expect(Object.isFrozen(IMMUTABLE_CONTENT_STATUSES)).toBe(true);
    expect(Object.isFrozen(CHANGE_REQUEST_LOCKED_STATUSES)).toBe(true);
  });
});