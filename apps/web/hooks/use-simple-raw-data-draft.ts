'use client';

import { useCallback } from 'react';

/**
 * Local-only draft persistence for the SIMPLIFIED (text-first) request flow.
 *
 * Stored under its OWN localStorage key, deliberately different from the legacy
 * wizard key (`so:raw-data-draft:<clientId>`): the simplified flow carries a
 * different shape and must never overwrite or corrupt an in-flight legacy
 * draft. localStorage only - no server API, matching the legacy hook.
 */
const keyFor = (clientId: string) => `so:raw-data-simple-draft:${clientId}`;

export interface SimpleRequestDraft {
  /** The single free-text story. */
  story: string;
  /**
   * R1: client corrections keyed by existing metadata keys. Overrides win over
   * derived values; an explicit clear is '' (single) / [] (multi). Absent for
   * pre-R1 drafts (see `values`).
   */
  overrides?: Record<string, string | string[]>;
  /**
   * Pre-R1 field: the composed Screen 2 values. Kept in the type so old drafts
   * keep loading; the loader maps `values` to overrides when `overrides` is
   * absent (harmless: composed values re-assert the same values).
   */
  values?: Record<string, string | string[]>;
  /** 0 = story, 1 = review. */
  step?: 0 | 1;
}

export function useSimpleRawDataDraft(clientId: string) {
  const save = useCallback(
    (draft: SimpleRequestDraft): boolean => {
      try {
        window.localStorage.setItem(keyFor(clientId), JSON.stringify(draft));
        return true;
      } catch {
        return false;
      }
    },
    [clientId],
  );

  const load = useCallback((): SimpleRequestDraft | null => {
    try {
      const raw = window.localStorage.getItem(keyFor(clientId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const draft = parsed as SimpleRequestDraft;
      if (typeof draft.story !== 'string') return null;
      return draft;
    } catch {
      return null;
    }
  }, [clientId]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(keyFor(clientId));
    } catch {
      /* ignore */
    }
  }, [clientId]);

  return { save, load, clear };
}
