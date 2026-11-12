'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Search, Filter, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
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
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu';

import { fetchAuditLogs } from '@/lib/super-admin-api';
import { loadSuperAdminSession, clearSuperAdminSession } from '@/lib/super-admin-session';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminAuditEvent, PaginatedAuditLogs } from '@/lib/super-admin-api';

/**
 * Validate step-up session on mount.
 * Mirrors the pattern used by super-admin-dashboard.tsx.
 */
function getSuperAdminSessionValidity(): boolean {
  const sessionData = loadSuperAdminSession();
  return sessionData !== null &&
    Boolean(sessionData.sessionToken) &&
    sessionData.expiresAt >= Date.now();
}

const actionOptions = [
  'platform_admin.bootstrap',
  'platform_admin.granted',
  'platform_admin.revoked',
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'client.created',
  'client.updated',
  'client.status_changed',
  'user.created',
  'user.updated',
  'user.deleted',
];

const targetTypeOptions = [
  'user',
  'organization',
  'client',
  'employee',
  'content',
  'settings',
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

export default function SuperAdminAuditPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: auditData, isLoading: auditLoading, error: auditError, refetch: refetchAudit } = useQuery({
    queryKey: ['superadmin', 'audit-logs', page, actionFilter, targetTypeFilter],
    queryFn: () => fetchAuditLogs({
      page,
      limit: 25,
      cursor,
      action: actionFilter || undefined,
      targetType: targetTypeFilter || undefined,
    }),
    retry: false,
    enabled: getSuperAdminSessionValidity(),
  });

  // Handle 403 from expired/revoked step-up sessions
  const handleSuperAdminError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 403) {
      clearSuperAdminSession();
      window.location.href = '/super-admin/step-up';
    }
  }, []);

  // React to 403 errors
  useEffect(() => {
    if (auditError) {
      handleSuperAdminError(auditError);
    }
  }, [auditError, handleSuperAdminError]);

  const logs = auditData?.data ?? [];

  const handleLoadMore = () => {
    if (auditData?.meta.hasNextPage && auditData.data.length > 0) {
      const lastItem = auditData.data[auditData.data.length - 1];
      setCursor(lastItem.id);
      setPage(p => p + 1);
    }
  };

  if (!getSuperAdminSessionValidity()) {
    return null;
  }

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

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Audit Logs</h1>
        <p className="text-sm text-slate-400">
          Platform-wide audit trail of administrative actions.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                Audit Log Viewer
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Query audit events by action, principal, or resource.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full max-w-sm sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search by action or target..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="w-full sm:w-auto gap-2">
                  <Filter className="h-4 w-4" />
                  <span>Action: {actionFilter ? formatAction(actionFilter) : 'All'}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-80">
                <DropdownMenuItem
                  onClick={() => setActionFilter('')}
                  className={!actionFilter ? 'bg-blue-500/10 text-blue-400' : ''}
                >
                  All Actions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {actionOptions.map((action) => (
                  <DropdownMenuItem
                    key={action}
                    onClick={() => setActionFilter(action)}
                    className={actionFilter === action ? 'bg-blue-500/10 text-blue-400' : ''}
                  >
                    {formatAction(action)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="w-full sm:w-auto gap-2">
                  <Filter className="h-4 w-4" />
                  <span>Target: {targetTypeFilter || 'All'}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  onClick={() => setTargetTypeFilter('')}
                  className={!targetTypeFilter ? 'bg-blue-500/10 text-blue-400' : ''}
                >
                  All Target Types
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {targetTypeOptions.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => setTargetTypeFilter(type)}
                    className={targetTypeFilter === type ? 'bg-blue-500/10 text-blue-400' : ''}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Audit Log Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {auditLoading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      Loading audit logs...
                      <Loader2 className="mx-auto mt-2 h-6 w-6 animate-spin text-blue-400" />
                    </td>
                  </tr>
                ) : auditError ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-red-400">
                      <AlertCircle className="mx-auto mb-2 h-6 w-6" />
                      <p className="text-sm">Failed to load audit logs: {auditError.message}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => refetchAudit()}
                      >
                        Try Again
                      </Button>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      No audit events found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-slate-200 font-mono text-xs">
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-slate-400">
                          {log.actorUserId.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">
                            {log.targetType}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono text-[10px]">
                            {log.targetId.slice(0, 8)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          <details className="group">
                            <summary className="text-slate-500 text-xs cursor-pointer flex items-center gap-1 hover:text-slate-300">
                              <span>View details</span>
                              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                            </summary>
                            <pre className="mt-1 p-2 rounded bg-slate-900/50 text-[10px] text-slate-300 overflow-auto max-h-32">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load More / Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {logs.length} of {auditData?.meta.total ?? logs.length} events
            </p>
            <div className="flex items-center gap-2">
              {auditData?.meta.hasNextPage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={auditLoading}
                >
                  Load More
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
