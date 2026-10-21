'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Users,
  Building,
  Shield,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertTriangle,
  FileText,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSession } from '@/hooks/use-session';
import { apiFetch } from '@/lib/api';
import { loadSuperAdminSession, clearSuperAdminSession } from '@/lib/super-admin-session';

// Types matching backend responses
interface Organization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  kind: 'AGENCY' | 'SOCIALOPS';
  discoveryOptIn: boolean;
  discoveryApprovedAt: string | null;
  discoveryApprovedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  displayName: string | null;
  fullName: string | null;
  accountType: 'SERVICE_PROVIDER' | 'CLIENT' | null;
  clientType: 'INDIVIDUAL' | 'BUSINESS' | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isBot: boolean;
  skillSpecialization: string | null;
  isSocialOpsAdmin: boolean;
  socialOpsAdminGrantedAt: string | null;
  socialOpsAdminGrantedById: string | null;
  socialOpsAdminRevokedAt: string | null;
  platformPermissions: string[];
  memberships: { organizationId: string; role: string }[];
}

interface Client {
  id: string;
  name: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  onboardingStatus: 'PENDING' | 'ACTIVE';
  description: string | null;
  website: string | null;
  industry: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

function fetchWithSessionToken<T>(url: string): Promise<T> {
  const sessionData = loadSuperAdminSession();
  if (!sessionData?.sessionToken) {
    throw new Error('No step-up session token');
  }
  return apiFetch<T>(url, {
    headers: { Authorization: `Bearer ${sessionData.sessionToken}` },
  });
}

function fetchOrganizations(page = 1, limit = 25, cursor?: string): Promise<PaginatedResponse<Organization>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return fetchWithSessionToken(`/api/admin/organizations?${params}`);
}

function fetchUsers(page = 1, limit = 25, cursor?: string): Promise<PaginatedResponse<User>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return fetchWithSessionToken(`/api/admin/users?${params}`);
}

function fetchClients(page = 1, limit = 25, cursor?: string): Promise<PaginatedResponse<Client>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return fetchWithSessionToken(`/api/admin/clients?${params}`);
}

export function SuperAdminDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, logout } = useSession();

  // Check for valid step-up session on mount
  const [sessionValid, setSessionValid] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const sessionData = loadSuperAdminSession();
    if (!sessionData?.sessionToken) {
      setSessionValid(false);
      router.push('/super-admin/step-up');
    } else if (sessionData.expiresAt < Date.now()) {
      clearSuperAdminSession();
      setSessionValid(false);
      router.push('/super-admin/step-up');
    }
    setCheckingSession(false);
  }, [router]);

  // Fetch data
  const { data: orgsData, isLoading: orgsLoading, error: orgsError, refetch: refetchOrgs } = useQuery({
    queryKey: ['superadmin', 'organizations'],
    queryFn: () => fetchOrganizations(),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  const { data: usersData, isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['superadmin', 'users'],
    queryFn: () => fetchUsers(),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  const { data: clientsData, isLoading: clientsLoading, error: clientsError, refetch: refetchClients } = useQuery({
    queryKey: ['superadmin', 'clients'],
    queryFn: () => fetchClients(),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  const isLoading = orgsLoading || usersLoading || clientsLoading;
  const hasError = orgsError || usersError || clientsError;

  const handleLogout = async () => {
    clearSuperAdminSession();
    if (session) {
      await logout();
    }
    router.push('/super-admin/login');
    router.refresh();
  };

  const handleRefresh = () => {
    refetchOrgs();
    refetchUsers();
    refetchClients();
  };

  if (checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!sessionValid) {
    return null; // Will redirect via effect
  }

  const orgs = orgsData?.data ?? [];
  const users = usersData?.data ?? [];
  const clients = clientsData?.data ?? [];

  const orgsTotal = orgsData?.meta.total ?? 0;
  const usersTotal = usersData?.meta.total ?? 0;
  const clientsTotal = clientsData?.meta.total ?? 0;

  const activeOrgs = orgs.filter((o) => o.isActive).length;
  const activeUsers = users.filter((u) => u.isActive).length;
  const activeClients = clients.filter((c) => c.status === 'ACTIVE').length;
  const adminUsers = users.filter((u) => u.isSocialOpsAdmin).length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            Super Admin Console
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Platform-wide administration · Step-up session active
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card surface="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{orgsTotal}</div>
            <p className="text-xs text-slate-400">{activeOrgs} active</p>
          </CardContent>
        </Card>

        <Card surface="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Users</CardTitle>
            <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{usersTotal}</div>
            <p className="text-xs text-slate-400">{activeUsers} active · {adminUsers} admins</p>
          </CardContent>
        </Card>

        <Card surface="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Clients</CardTitle>
            <Building className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{clientsTotal}</div>
            <p className="text-xs text-slate-400">{activeClients} active</p>
          </CardContent>
        </Card>

        <Card surface="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Platform Admins</CardTitle>
            <Shield className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{adminUsers}</div>
            <p className="text-xs text-slate-400">SOCIALOPS_ADMIN users</p>
          </CardContent>
        </Card>
      </div>

      {hasError && (
        <Card className="border-red-900/50 bg-red-950/30">
          <CardContent className="text-sm text-red-300">
            Failed to load some data. <Button variant="ghost" size="sm" onClick={handleRefresh} className="px-2 py-0 text-xs">Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs/Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Organizations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Organizations</CardTitle>
            <Badge variant="outline" className="text-xs">{orgsTotal}</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : orgs.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No organizations found</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {orgs.map((org) => (
                  <Link
                    key={org.id}
                    href={`/super-admin/organizations/${org.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full ${org.isActive ? 'bg-green-500' : 'bg-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{org.name}</p>
                        <p className="text-xs text-slate-400 truncate">{org.slug} · {org.kind}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {org.discoveryOptIn && (
                        <Badge variant="secondary" className="text-xs">Discovery</Badge>
                      )}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Users</CardTitle>
            <Badge variant="outline" className="text-xs">{usersTotal}</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No users found</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {users.map((user) => (
                  <Link
                    key={user.id}
                    href={`/super-admin/users/${user.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">
                          {user.fullName ?? user.email}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {user.email}
                          {user.accountType && ` · ${user.accountType}`}
                          {user.isBot && ' · Bot'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {user.isSocialOpsAdmin && (
                        <Badge variant="secondary" className="text-xs bg-blue-900/50 text-blue-300 border-blue-800">
                          Admin
                        </Badge>
                      )}
                      {user.isBot && (
                        <Badge variant="outline" className="text-xs">Bot</Badge>
                      )}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clients */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Clients</CardTitle>
            <Badge variant="outline" className="text-xs">{clientsTotal}</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : clients.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No clients found</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {clients.map((client) => (
                  <Link
                    key={client.id}
                    href={`/super-admin/clients/${client.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full ${
                        client.status === 'ACTIVE' ? 'bg-green-500' :
                        client.status === 'SUSPENDED' ? 'bg-amber-500' : 'bg-slate-500'
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{client.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {client.type} · {client.status} · {client.onboardingStatus}
                          {client.industry && ` · ${client.industry}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Badge
                        variant={client.status === 'ACTIVE' ? 'default' :
                                 client.status === 'SUSPENDED' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {client.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common platform administration tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/super-admin/organizations">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
              View All Organizations
            </Button>
          </Link>
          <Link href="/super-admin/users">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" aria-hidden="true" />
              View All Users
            </Button>
          </Link>
          <Link href="/super-admin/clients">
            <Button variant="outline">
              <Building className="h-4 w-4 mr-2" aria-hidden="true" />
              View All Clients
            </Button>
          </Link>
          <Link href="/super-admin/platform-admins">
            <Button variant="outline">
              <Shield className="h-4 w-4 mr-2" aria-hidden="true" />
              Manage Platform Admins
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}