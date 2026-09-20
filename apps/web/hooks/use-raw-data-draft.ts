'use client';

import { useCallback } from 'react';

const keyFor = (clientId: string) => `so:raw-data-draft:${clientId}`;

/**
 * Local-only draft persistence for the Raw Data Input wizard.
 * localStorage exclusively — no server API (Rules: DRAFT freely editable).
 */
export function useRawDataDraft(clientId: string) {
  const save = useCallback(
    (values: Record<string, unknown>) => {
      try {
        window.localStorage.setItem(keyFor(clientId), JSON.stringify(values));
        return true;
      } catch {
        return false;
      }
    },
    [clientId],
  );

  const load = useCallback((): Record<string, unknown> | null => {
    try {
      const raw = window.localStorage.getItem(keyFor(clientId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return null;
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
