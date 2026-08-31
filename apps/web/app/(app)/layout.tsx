import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';

/**
 * Authenticated app layout.
 *
 * The route group `(app)` is reserved for routes that require an
 * authenticated session. Because session tokens are stored in
 * `localStorage` (an AGENTS.md §8-acceptable bootstrap trade-off
 * until encrypted token storage is implemented), the actual
 * session check is performed on the client. The dashboard page
 * itself performs a `useSession` check and redirects to `/login`
 * when unauthenticated.
 *
 * This is a UX convenience, not a security boundary - the
 * backend enforces authorization on every API call.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
