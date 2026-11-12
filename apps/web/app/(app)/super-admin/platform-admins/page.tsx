'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserPlus } from 'lucide-react';
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
import { fetchPlatformAdmins } from '@/lib/super-admin-api';
import { loadSuperAdminSession, clearSuperAdminSession } from '@/lib/super-admin-session';
import { apiFetch, ApiError } from '@/lib/api';
import { PlatformAdminTable } from '@/components/super-admin/platform-admin-table';
import { GrantAdminDialog } from '@/components/super-admin/grant-admin-dialog';
import { RevokeAdminDialog } from '@/components/super-admin/revoke-admin-dialog';
import type { PlatformAdminInfo } from '@/lib/super-admin-api';

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

export default function SuperAdminPlatformAdminsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PlatformAdminInfo | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['superadmin', 'platform-admins'],
    queryFn: () => fetchPlatformAdmins({ limit: 50 }),
    retry: false,
  });

  // Handle 403 from expired/revoked step-up sessions by redirecting
  // to the step-up page. The apiFetch layer already throws ApiError
  // with status 403 — we catch it here to trigger re-authentication.
  const handleSuperAdminError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 403) {
      clearSuperAdminSession();
      window.location.href = '/super-admin/step-up';
    }
  }, []);

  useEffect(() => {
    if (error) {
      handleSuperAdminError(error);
    }
  }, [error, handleSuperAdminError]);

  const admins = data?.data ?? [];

  // Client-side filtering by email (backend does not support email search)
  const filteredAdmins = searchQuery
    ? admins.filter((admin) =>
        admin.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (admin.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : admins;

  const handleGrantSuccess = useCallback(() => {
    setGrantDialogOpen(false);
    refetch();
  }, [refetch]);

  const handleRevokeSuccess = useCallback(() => {
    setRevokeTarget(null);
    refetch();
  }, [refetch]);

  const handleRevokeClick = useCallback((admin: PlatformAdminInfo) => {
    setRevokeTarget(admin);
  }, []);

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
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Platform Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage platform administrators and system configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm sm:w-72">
            <svg
              className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-900/50 border-slate-800 text-slate-200"
            />
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setGrantDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-500"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Grant Admin
          </Button>
        </div>
      </div>

      <PlatformAdminTable
        admins={filteredAdmins}
        onRevoke={handleRevokeClick}
        isLoading={isLoading}
        error={error instanceof Error ? error : null}
      />

      <GrantAdminDialog
        open={grantDialogOpen}
        onClose={() => setGrantDialogOpen(false)}
        onSuccess={handleGrantSuccess}
      />

      <RevokeAdminDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        admin={revokeTarget}
        onSuccess={handleRevokeSuccess}
      />
    </div>
  );
}
