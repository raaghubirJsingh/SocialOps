'use client';

import { useQuery } from '@tanstack/react-query';
import { Users2, Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { loadSuperAdminSession } from '@/lib/super-admin-session';

interface User {
  id: string;
  email: string;
  fullName: string | null;
  accountType: 'SERVICE_PROVIDER' | 'CLIENT' | null;
  isActive: boolean;
  isSocialOpsAdmin: boolean;
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

function fetchWithSessionToken<T>(url: string): Promise<T> {
  const sessionData = loadSuperAdminSession();
  return apiFetch<T>(url, {
    headers: { 'X-Admin-Session-Token': sessionData?.sessionToken ?? '' },
  });
}

export default function UsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin', 'users'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<User>>('/admin/users?limit=50'),
  });

  const users = data?.data ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/super-admin">
          <Button variant="ghost" size="sm" className="text-slate-400">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Overview
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Users</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage and monitor all platform user accounts and permissions.
          </p>
        </div>
        <div className="relative w-full max-w-sm sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search users..."
            className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200"
          />
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Users2 className="h-4 w-4 text-purple-400" />
            All Platform Users ({data?.meta.total ?? 0})
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Cross-tenant list of all platform users with account types and admin flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Account Type</th>
                  <th className="px-4 py-3">Role / Flag</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-200">{user.fullName ?? 'Unnamed User'}</div>
                        <div className="text-xs text-slate-500 font-mono">{user.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="neutral" className="bg-slate-800 border-slate-700 text-slate-400">
                          {user.accountType ?? 'Employee / None'}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {user.isSocialOpsAdmin ? (
                          <Badge variant="info" className="bg-purple-950/30 text-purple-300 border-purple-800/50">
                            SuperAdmin
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={user.isActive ? "success" : "neutral"} className={user.isActive ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/50" : "bg-slate-800 text-slate-500 border-slate-700"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}