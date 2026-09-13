'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { makeQueryClient } from '@/lib/query-client';
import { SessionProvider } from '@/hooks/use-session';
import { ActiveOrganizationProvider } from '@/hooks/use-active-organization';

/**
 * Root client-side provider tree.
 *
 * The order matters:
 *   1. QueryClientProvider wraps the app so any component (including
 *      the session provider, layout, and pages) can use
 *      TanStack Query hooks.
 *   2. SessionProvider sits inside the query client so that future
 *      session mutations can invalidate query caches from a single
 *      place.
 *
 * The `QueryClient` is created lazily, once per browser tab. In
 * Next.js App Router, server components do not own the client - so
 * this component is rendered as a client component and the
 * `QueryClient` is memoised with `useState(() => makeQueryClient())`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState<QueryClient>(() => makeQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ActiveOrganizationProvider>{children}</ActiveOrganizationProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
