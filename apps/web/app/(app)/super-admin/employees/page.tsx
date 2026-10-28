'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { loadSuperAdminSession } from '@/lib/super-admin-session';

interface Employee {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
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

export default function EmployeesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin', 'employees'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<Employee>>('/admin/employees?limit=50'),
  });

  const employees = data?.data ?? [];

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
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Employees</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage and monitor all employee profiles registered on the platform.
          </p>
        </div>
        <div className="relative w-full max-w-sm sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search employees..."
            className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200"
          />
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-400" />
            All Employee Profiles ({data?.meta.total ?? 0})
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Cross-tenant list of all registered employee profiles with their identity details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name & Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Profile ID</th>
                  <th className="px-4 py-3">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                      Loading employees...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-200">{employee.fullName ?? 'Unnamed Employee'}</div>
                        <div className="text-xs text-slate-500 font-mono">{employee.email}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-400">
                        {employee.phone ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-500 font-mono text-xs">
                        {employee.id}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(employee.createdAt).toLocaleDateString()}
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