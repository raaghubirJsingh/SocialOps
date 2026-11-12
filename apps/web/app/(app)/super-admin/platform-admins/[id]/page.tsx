'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Mail, Shield, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { fetchPlatformAdmin } from '@/lib/super-admin-api';
import { loadSuperAdminSession } from '@/lib/super-admin-session';
import { apiFetch, ApiError } from '@/lib/api';
import { PermissionBadges } from '@/components/super-admin/permission-badge';
import type { PlatformAdminInfo } from '@/lib/super-admin-api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fetchWithSessionToken<T>(url: string): Promise<T> {
  const sessionData = loadSuperAdminSession();
  return apiFetch<T>(url, {
    headers: { 'X-Admin-Session-Token': sessionData?.sessionToken ?? '' },
  });
}

interface PlatformAdminDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PlatformAdminDetailPage({ params }: PlatformAdminDetailPageProps) {
  const { data: admin, isLoading, error, refetch } = useQuery({
    queryKey: ['superadmin', 'platform-admin-detail'],
    queryFn: async () => {
      const resolvedParams = await params;
      return fetchPlatformAdmin(resolvedParams.id);
    },
    enabled: true,
    retry: false,
  });

  // Handle 403 errors (step-up expired)
  if (error instanceof ApiError && error.status === 403) {
    // The dashboard's error handler will redirect to step-up
    // but we need to trigger it here as well
    if (typeof window !== 'undefined') {
      window.location.href = '/super-admin/step-up';
    }
    return null;
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
        </div>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
        <Card className="border-slate-800 bg-slate-900/40">
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-4 text-slate-400">
              {error instanceof Error ? error.message : 'Platform administrator not found'}
            </p>
            <Link href="/super-admin/platform-admins">
              <Button variant="secondary" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to List
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRevoked = admin.socialOpsAdminRevokedAt !== null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/super-admin/platform-admins">
          <Button variant="ghost" size="sm" className="text-slate-400">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            {admin.fullName ?? 'Unnamed User'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Platform Administrator Details
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/super-admin/platform-admins">
            <Button variant="secondary" size="sm" className="border-slate-800 text-slate-300">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to List
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info Card */}
        <Card className="border-slate-800 bg-slate-900/40 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 font-bold text-lg">
                {(admin.fullName ?? admin.email).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-100">
                  {admin.fullName ?? 'Unnamed User'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {admin.email}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400">Status:</span>
              {isRevoked ? (
                <Badge variant="danger" className="bg-red-950/30 text-red-400 border-red-800/50">
                  Revoked
                </Badge>
              ) : (
                <Badge variant="success" className="bg-emerald-950/30 text-emerald-400 border-emerald-800/50">
                  Active SuperAdmin
                </Badge>
              )}
            </div>

            <Separator />

            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-300">Platform Permissions</span>
                <span className="text-xs text-slate-500">
                  {admin.platformPermissions.length} of {11} total
                </span>
              </div>
              <PermissionBadges
                permissions={admin.platformPermissions}
                maxVisible={11}
                variant="default"
              />
            </div>

            <Separator />

            {/* Timeline */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Timeline</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Granted Platform Admin</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(admin.socialOpsAdminGrantedAt)}
                      {admin.socialOpsAdminGrantedById && (
                        <> · Granted by {admin.socialOpsAdminGrantedById.slice(0, 8)}...</>
                      )}
                    </p>
                  </div>
                </div>
                {isRevoked && (
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">Revoked Platform Admin</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(admin.socialOpsAdminRevokedAt)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Side Card: Quick Info */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <User className="h-4 w-4 text-blue-400" />
              Quick Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">User ID</span>
                <span className="font-mono text-slate-300 text-xs">{admin.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-mono text-slate-300 text-xs">{admin.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Full Name</span>
                <span className="text-slate-300 text-xs">{admin.fullName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Granted At</span>
                <span className="text-slate-300 text-xs">{formatDateOnly(admin.socialOpsAdminGrantedAt)}</span>
              </div>
              {isRevoked && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Revoked At</span>
                  <span className="text-slate-300 text-xs">{formatDateOnly(admin.socialOpsAdminRevokedAt)}</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300">Permission Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-slate-500">Global Read</div>
                  <div className="font-medium text-emerald-400">
                    {admin.platformPermissions.filter(p => p.startsWith('GLOBAL_')).length} / 6
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-slate-500">Platform Roles</div>
                  <div className="font-medium text-blue-400">
                    {admin.platformPermissions.filter(p => p.startsWith('PLATFORM_ROLE_')).length} / 2
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-slate-500">Platform Ops</div>
                  <div className="font-medium text-purple-400">
                    {admin.platformPermissions.filter(p => p.startsWith('PLATFORM_') && !p.startsWith('PLATFORM_ROLE_')).length} / 2
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-slate-500">Client & Agency</div>
                  <div className="font-medium text-amber-400">
                    {admin.platformPermissions.filter(p => !p.startsWith('GLOBAL_') && !p.startsWith('PLATFORM_')).length} / 1
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}