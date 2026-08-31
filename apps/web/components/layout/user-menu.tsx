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
 * Shows the authenticated user's email and a logout action. The
 * logout button calls the backend `/api/auth/logout` to revoke the
 * refresh token, then wipes local session state and navigates to
 * the root path.
 */
export function UserMenu() {
  const router = useRouter();
  const { session, logout, isLoading } = useSession();
  const email = session?.email;

  const handleLogout = async () => {
    await logout();
    router.push('/');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Open user menu"
        disabled={isLoading}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">
          {email ?? 'Signed in'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm text-slate-300 break-all">
          {email ?? '(unknown)'}
        </div>
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
