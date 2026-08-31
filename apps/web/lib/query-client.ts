import { QueryClient } from '@tanstack/react-query';

/**
 * Factory for the singleton `QueryClient` used by the app.
 *
 * Defaults are intentionally conservative:
 *   - `retry: 1` keeps transient network blips tolerable without
 *     amplifying server incidents.
 *   - `refetchOnWindowFocus: false` matches the dashboard's
 *     low-frequency read pattern (the foundation only calls the
 *     public health endpoint).
 *   - `staleTime: 30s` keeps the UI from re-fetching on every render.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
