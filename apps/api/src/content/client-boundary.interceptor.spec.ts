import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { ClientBoundaryInterceptor } from './client-boundary.interceptor.js';

/**
 * Phase 2 strict data boundary: a Client response must never carry the Agency's
 * internal notes or the managing Agency's id, and the sanitisation must not
 * damage the payload it legitimately returns.
 */
function runThrough(data: unknown): Promise<unknown> {
  const interceptor = new ClientBoundaryInterceptor();
  const next: CallHandler = { handle: () => of(data) };
  return firstValueFrom(
    interceptor.intercept({} as ExecutionContext, next),
  ) as Promise<unknown>;
}

describe('ClientBoundaryInterceptor', () => {
  it('strips internalNotes and agencyId from a Content row', async () => {
    const result = (await runThrough({
      id: 'content-1',
      title: 'Draft',
      agencyId: 'agency-secret',
      internalNotes: [{ id: 'note-1', body: 'internal discussion' }],
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty('agencyId');
    expect(result).not.toHaveProperty('internalNotes');
    expect(result.id).toBe('content-1');
    expect(result.title).toBe('Draft');
  });

  it('strips the agency fields from every row of a list', async () => {
    const result = (await runThrough([
      { id: 'content-1', agencyId: 'agency-secret', internalNotes: [] },
      { id: 'content-2', agencyId: 'agency-secret', internalNotes: [] },
    ])) as Record<string, unknown>[];

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row).not.toHaveProperty('agencyId');
      expect(row).not.toHaveProperty('internalNotes');
    }
  });

  it('strips agency fields nested inside another object', async () => {
    const result = (await runThrough({
      content: {
        id: 'content-1',
        agencyId: 'agency-secret',
        internalNotes: [{ id: 'note-1' }],
      },
    })) as { content: Record<string, unknown> };

    expect(result.content).not.toHaveProperty('agencyId');
    expect(result.content).not.toHaveProperty('internalNotes');
    expect(result.content.id).toBe('content-1');
  });

  it('preserves Date instances instead of flattening them to {}', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const result = (await runThrough({
      id: 'content-1',
      createdAt,
      finalConfirmedAt: null,
    })) as Record<string, unknown>;

    // The wire contract keeps ISO timestamps: a Date must survive the strip.
    expect(result.createdAt).toBe(createdAt);
    expect(JSON.stringify(result.createdAt)).toBe(
      '"2026-01-02T03:04:05.000Z"',
    );
    expect(result.finalConfirmedAt).toBeNull();
  });

  it('leaves scalar, null and undefined payloads untouched', async () => {
    expect(await runThrough('ok')).toBe('ok');
    expect(await runThrough(204)).toBe(204);
    expect(await runThrough(null)).toBeNull();
    expect(await runThrough(undefined)).toBeUndefined();
  });
});
