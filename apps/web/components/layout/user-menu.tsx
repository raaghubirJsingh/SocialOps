'use client';

import { useRouter } from 'next/navigation';
import { LogOut, UserRound } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/hooks/use-session';

/**
 * User menu in the top bar.
 *
 * Shows the authenticated user's registered Full Name (with the
 * email as a secondary fallback) and a logout action. The logout
 * button calls the backend `/api/auth/logout` to revoke the refresh
 * token, then wipes local session state and navigates to the root
 * path.
 */
export function UserMenu() {
  const router = useRouter();
  const { session, logout, isLoading } = useSession();
  // The primary trigger label prefers the registered Full Name
  // (AGENTS.md §17). It falls back to the email only when the Full
  // Name is unavailable (pre-migration row, stale session, etc.).
  const fullName = session?.user.fullName;
  const email = session?.user.email ?? session?.email;
  const triggerLabel = fullName ?? email ?? 'Signed in';

  const handleLogout = async () => {
    await logout();
    router.push('/');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-slate-600 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Open user menu"
        disabled={isLoading}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{triggerLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm text-slate-300 break-all">
          {fullName ?? '(unknown)'}
        </div>
        {email ? (
          <div className="px-2 pb-2 text-xs text-slate-400 break-all">
            {email}
          </div>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          disabled={isLoading}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
