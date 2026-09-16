'use client';

import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSession } from '@/hooks/use-session';
import { getOwnProfile, type EmployeeProfileResponse } from '@/lib/employee-api';

/**
 * EmployeeProfileCard — read-only presence marker.
 *
 * Renders the authenticated employee's profile from
 * GET /api/employees/me/profile. Strictly display-only:
 * no editing, no analytics, no status management (AGENTS.md §13).
 */
export function EmployeeProfileCard() {
  const { isAuthenticated, isLoading: sessionLoading, session } = useSession();
  const isEmployee = session?.user?.isEmployee === true;

  const {
    data: profile,
    isPending,
    isError,
    error,
  } = useQuery<EmployeeProfileResponse>({
    queryKey: ['employee-profile'],
    queryFn: () => getOwnProfile(),
    // The profile API is only callable by employees; only enable
    // the query once the session is stable and confirms the
    // employee flag (AGENTS.md §6 — deny by default).
    enabled: !sessionLoading && isAuthenticated && isEmployee,
    retry: 0,
  });

  if (!isEmployee) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-200">
          Your profile
        </CardTitle>
        <UserRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <CardDescription>
          Employee Module V1 — read-only presence marker.
        </CardDescription>

        {isPending && (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        )}

        {isError && (
          <p className="mt-2 text-sm text-red-400">
            Unable to load profile.{' '}
            <span className="text-xs text-slate-500">
              ({(error as Error)?.message ?? 'unknown error'})
            </span>
          </p>
        )}

        {profile && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Employee ID</dt>
            <dd className="text-slate-100 font-mono">{profile.id}</dd>

            <dt className="text-slate-500">Full name</dt>
            <dd className="text-slate-100">
              {profile.user.fullName ?? '—'}
            </dd>

            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-100">{profile.user.email}</dd>

            <dt className="text-slate-500">Profile created</dt>
            <dd className="text-slate-100">
              {new Date(profile.createdAt).toLocaleDateString()}
            </dd>

            <dt className="text-slate-500">Last updated</dt>
            <dd className="text-slate-100">
              {new Date(profile.updatedAt).toLocaleDateString()}
            </dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}