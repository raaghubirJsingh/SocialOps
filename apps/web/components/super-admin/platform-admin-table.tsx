'use client';

import { ArrowLeft, Calendar, Shield, User, Mail } from 'lucide-react';
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
import type { PlatformAdminInfo } from '@/lib/super-admin-api';
import { PermissionBadges } from './permission-badge';

interface PlatformAdminTableProps {
  admins: PlatformAdminInfo[];
  onRevoke: (admin: PlatformAdminInfo) => void;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * Format a date string to a readable date.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Reusable table for displaying platform administrators.
 * Handles loading, empty, and error states.
 * Delegates revoke actions to the parent page.
 */
export function PlatformAdminTable({
  admins,
  onRevoke,
  isLoading = false,
  error = null,
}: PlatformAdminTableProps) {
  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-400" />
            Platform Administrators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <p className="text-red-400 text-sm">
              Failed to load platform administrators: {error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          Platform Administrators
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          All users with platform administrator privileges. Click a row to view details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Granted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                    Loading platform administrators...
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                    No platform administrators found.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr
                    key={admin.id}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => {
                      window.location.href = `/super-admin/platform-admins/${admin.id}`;
                    }}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 text-purple-400 font-semibold text-xs">
                          {(admin.fullName ?? admin.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-200">
                            {admin.fullName ?? 'Unnamed User'}
                          </div>
                          <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {admin.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <PermissionBadges
                        permissions={admin.platformPermissions}
                        maxVisible={3}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(admin.socialOpsAdminGrantedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {admin.socialOpsAdminRevokedAt ? (
                        <Badge variant="danger" className="bg-red-950/30 text-red-400 border-red-800/50">
                          Revoked
                        </Badge>
                      ) : (
                        <Badge variant="success" className="bg-emerald-950/30 text-emerald-400 border-emerald-800/50">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Link href={`/super-admin/platform-admins/${admin.id}`}>
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
                            View
                          </Button>
                        </Link>
                        {!admin.socialOpsAdminRevokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => onRevoke(admin)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}