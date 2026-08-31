import type { ReactNode } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

/**
 * Application shell. Provides the persistent sidebar + topbar
 * layout for every authenticated route.
 *
 * The foundation shell is intentionally simple:
 *   - fixed sidebar on md+ screens
 *   - full-width main area on smaller screens
 *   - top bar with the active section title and user menu
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <section className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
          {children}
        </main>
      </section>
    </div>
  );
}
