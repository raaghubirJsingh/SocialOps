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
        {/* `isolate` + a negative-z glow keeps the decorative layer behind the
            content without an extra wrapper element, and gives the sticky glass
            topbar something to blur. Deliberately a single soft radial and NOT
            `bg-grid-faint`: this area is data-dense, and a texture behind
            tables, lists and form rows measurably hurts readability. */}
        <main className="relative isolate flex-1 overflow-y-auto bg-slate-950 p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.08),transparent_65%)]"
          />
          {children}
        </main>
      </section>
    </div>
  );
}
