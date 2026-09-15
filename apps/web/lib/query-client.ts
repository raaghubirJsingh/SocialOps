import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api';

/**
 * Factory for the singleton `QueryClient` used by the app.
 *
 * Defaults are intentionally conservative:
 *   - `retry` keeps transient network blips tolerable without amplifying
 *     server incidents, but auth failures are NEVER retried blindly:
 *     401s are recovered by apiFetch (single-flight refresh + one retry)
 *     and 401/403 otherwise need user action (re-login, re-pick org), so
 *     surfacing them immediately is correct.
 *   - `refetchOnWindowFocus: false` matches the dashboard's
 *     low-frequency read pattern (the foundation only calls the
 *     public health endpoint).
 *   - `staleTime: 30s` keeps the UI from re-fetching on every render.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (
            error instanceof ApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
