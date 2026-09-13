import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Authenticated app layout.
 *
 * The route group `(app)` is reserved for routes that require an
 * authenticated session: /dashboard and future approved routes. Because
 * session tokens are stored in `localStorage` (an AGENTS.md §8-
 * acceptable bootstrap trade-off until encrypted token storage is
 * implemented), the session check is performed on the client: the
 * AuthGuard redirects unauthenticated visitors to the public home
 * page "/" (approved routing matrix).
 *
 * This is a UX convenience, not a security boundary - the backend
 * enforces authorization on every API call.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
