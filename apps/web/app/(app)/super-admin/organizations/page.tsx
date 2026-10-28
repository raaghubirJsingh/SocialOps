'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Search, ArrowLeft } from 'lucide-react';
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

interface Organization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  kind: 'AGENCY' | 'SOCIALOPS';
  discoveryOptIn: boolean;
  discoveryApprovedAt: string | null;
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

export default function AgenciesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin', 'organizations'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<Organization>>('/admin/organizations?limit=50'),
  });

  const orgs = data?.data ?? [];

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
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Agencies</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage and monitor all service provider organizations on the platform.
          </p>
        </div>
        <div className="relative w-full max-w-sm sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search agencies..."
            className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200"
          />
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-400" />
            All Organizations ({data?.meta.total ?? 0})
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Cross-tenant list of all registered agencies and internal units.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name & Slug</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Discovery</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      Loading organizations...
                    </td>
                  </tr>
                ) : orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      No organizations found.
                    </td>
                  </tr>
                ) : (
                  orgs.map((org) => (
                    <tr key={org.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-200">{org.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{org.slug}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="neutral" className="bg-slate-800 border-slate-700 text-slate-400">
                          {org.kind}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {org.discoveryOptIn ? (
                          <Badge variant="success" className="bg-emerald-950/30 text-emerald-400 border-emerald-800/50">
                            Opted In
                          </Badge>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={org.isActive ? "success" : "neutral"} className={org.isActive ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/50" : "bg-slate-800 text-slate-500 border-slate-700"}>
                          {org.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(org.createdAt).toLocaleDateString()}
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