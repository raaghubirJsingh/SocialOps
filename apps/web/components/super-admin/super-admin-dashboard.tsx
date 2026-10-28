'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Users,
  Shield,
  RefreshCw,
  Loader2,
  Share2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Layers,
  Settings,
  ChevronDown,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/hooks/use-session';
import { apiFetch, ApiError } from '@/lib/api';
import { loadSuperAdminSession, clearSuperAdminSession } from '@/lib/super-admin-session';
import { adminStepUpLogout } from '@/lib/auth-client';

// Data types matching the backend contracts
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

interface User {
  id: string;
  email: string;
  fullName: string | null;
  accountType: 'SERVICE_PROVIDER' | 'CLIENT' | null;
  isActive: boolean;
  isSocialOpsAdmin: boolean;
  createdAt: string;
}

interface Client {
  id: string;
  name: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  onboardingStatus: 'PENDING' | 'ACTIVE';
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

interface HealthCheckResult {
  status: 'ok' | 'error';
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  database: HealthCheckResult;
  redis: HealthCheckResult;
}

function fetchWithSessionToken<T>(url: string): Promise<T> {
  const sessionData = loadSuperAdminSession();
  if (!sessionData?.sessionToken) {
    throw new Error('No step-up session token');
  }
  return apiFetch<T>(url, {
    headers: { 'X-Admin-Session-Token': sessionData.sessionToken },
  });
}

export function SuperAdminDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, logout } = useSession();

  const [sessionValid, setSessionValid] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);

  // Validate step-up session on mount
  useEffect(() => {
    const sessionData = loadSuperAdminSession();
    if (!sessionData?.sessionToken || sessionData.expiresAt < Date.now()) {
      clearSuperAdminSession();
      setSessionValid(false);
      router.push('/super-admin/step-up');
    } else {
      setSessionValid(true);
    }
    setCheckingSession(false);
  }, [router]);

  // Handle 403 from expired/revoked step-up sessions by redirecting
  // to the step-up page. The apiFetch layer already throws ApiError
  // with status 403 — we catch it here to trigger re-authentication.
  // TanStack Query v5 has no `onError`/`onSettled` option on useQuery;
  // we destructure `error` from each result and react in a useEffect.
  const handleSuperAdminError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 403) {
      clearSuperAdminSession();
      setSessionValid(false);
      router.push('/super-admin/step-up');
    }
  };

  // Fetch real platform metrics
  const { data: orgsData, isLoading: orgsLoading, refetch: refetchOrgs, error: orgsError } = useQuery({
    queryKey: ['superadmin', 'organizations'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<Organization>>('/admin/organizations?limit=10'),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers, error: usersError } = useQuery({
    queryKey: ['superadmin', 'users'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<User>>('/admin/users?limit=10'),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  const { data: clientsData, isLoading: clientsLoading, refetch: refetchClients, error: clientsError } = useQuery({
    queryKey: ['superadmin', 'clients'],
    queryFn: () => fetchWithSessionToken<PaginatedResponse<Client>>('/admin/clients?limit=10'),
    enabled: sessionValid && !checkingSession,
    retry: false,
  });

  // React to 403 errors from any super-admin query — step-up session
  // expired, revoked, or consumed. Redirect to the step-up login page.
  useEffect(() => {
    if (orgsError || usersError || clientsError) {
      handleSuperAdminError(orgsError ?? usersError ?? clientsError);
    }
  }, [orgsError, usersError, clientsError]);

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['superadmin', 'health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    retry: false,
  });

  const isLoading = orgsLoading || usersLoading || clientsLoading || healthLoading;

  const handleRefresh = () => {
    refetchOrgs();
    refetchUsers();
    refetchClients();
    refetchHealth();
  };

  const handleLogout = async () => {
    // Revoke step-up sessions server-side before clearing local state.
    // If the revocation call fails, we still clear local state — the user's
    // intent is to log out regardless.
    try {
      await adminStepUpLogout();
    } catch {
      // Ignore — the regular logout below will still clear everything.
    }
    clearSuperAdminSession();
    if (session) {
      await logout();
    }
    router.push('/super-admin/login');
  };

  if (checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!sessionValid) {
    return null;
  }

  const orgs = orgsData?.data ?? [];
  const users = usersData?.data ?? [];
  const clients = clientsData?.data ?? [];

  const totalAgencies = orgsData?.meta.total ?? orgs.length;
  const totalClients = clientsData?.meta.total ?? clients.length;
  const totalUsers = usersData?.meta.total ?? users.length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      {/* Top Banner / Title Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Platform Administration
            </span>
            <Badge variant="info" className="bg-blue-900/40 text-blue-300 border-blue-700/50">
              SuperAdmin
            </Badge>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-100">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor the platform's operational health, account activity, and client distribution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex border-slate-800 text-slate-300">
            <Calendar className="mr-2 h-4 w-4 text-slate-400" />
            Last 30 days
            <ChevronDown className="ml-2 h-3.5 w-3.5 text-slate-500" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-slate-300 hover:bg-slate-900"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button variant="secondary" size="sm" onClick={handleLogout} className="border-red-900/50 text-red-400 hover:bg-red-950/30">
            Sign Out
          </Button>
        </div>
      </div>

      {/* 4 Stat Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Agencies */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-slate-400">Total Agencies</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Building2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-100">{totalAgencies}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Active Organizations</span>
            </div>
          </CardContent>
        </Card>

        {/* Total Clients */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-slate-400">Total Clients</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-100">{totalClients}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Registered accounts</span>
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-slate-400">Platform Users</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Share2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-100">{totalUsers}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-300">
              <Activity className="h-3.5 w-3.5" />
              <span>All active accounts</span>
            </div>
          </CardContent>
        </Card>

        {/* System Operations */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-slate-400">System State</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-100">
              {healthData?.status === 'ok' ? 'Healthy' : 'Degraded'}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Services operational</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Platform Overview & System Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Growth & Activity Summary (Left 2 Columns) */}
        <Card className="border-slate-800 bg-slate-900/40 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Platform Activity & Content Status
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Live distribution of verified tenants, client statuses, and services
              </CardDescription>
            </div>
            <Badge variant="neutral" className="border-slate-700 text-slate-300 text-xs">
              Live Monitoring
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <span className="text-xs font-medium text-slate-400">Agencies Online</span>
                <p className="mt-2 text-2xl font-bold text-slate-100">
                  {orgs.filter((o) => o.isActive).length}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Operational
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <span className="text-xs font-medium text-slate-400">Active Clients</span>
                <p className="mt-2 text-2xl font-bold text-slate-100">
                  {clients.filter((c) => c.status === 'ACTIVE').length}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-blue-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <span className="text-xs font-medium text-slate-400">Discovery Approvals</span>
                <p className="mt-2 text-2xl font-bold text-slate-100">
                  {orgs.filter((o) => o.discoveryOptIn).length}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-purple-400">
                  <Layers className="h-3 w-3" />
                  Opted In
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
              <Link href="/super-admin/organizations">
                <Button variant="secondary" size="sm" className="border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  Manage Agencies
                </Button>
              </Link>
              <Link href="/super-admin/clients">
                <Button variant="secondary" size="sm" className="border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  Manage Clients
                </Button>
              </Link>
              <Link href="/super-admin/users">
                <Button variant="secondary" size="sm" className="border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  Manage Users
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* System Health (Right Column) */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-slate-100">
              System Health
            </CardTitle>
            <Link
              href="/super-admin/health"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
            >
              View Details <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Database status */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-300">Database</span>
              </div>
              <Badge variant="success" className="border-emerald-800 bg-emerald-950/40 text-emerald-400 text-xs">
                {healthData?.database?.status === 'ok' ? 'Healthy' : 'Degraded'}
              </Badge>
            </div>

            {/* Redis / Queue status */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-300">Redis & Queues</span>
              </div>
              <Badge variant="success" className="border-emerald-800 bg-emerald-950/40 text-emerald-400 text-xs">
                {healthData?.redis?.status === 'ok' ? 'Healthy' : 'Degraded'}
              </Badge>
            </div>

            {/* API Health */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-300">REST API</span>
              </div>
              <Badge variant="success" className="border-emerald-800 bg-emerald-950/40 text-emerald-400 text-xs">
                {healthData?.status === 'ok' ? 'Healthy' : 'Checking'}
              </Badge>
            </div>

            {/* Authentication Gateway */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-300">Authentication</span>
              </div>
              <Badge variant="success" className="border-emerald-800 bg-emerald-950/40 text-emerald-400 text-xs">
                Healthy
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Recent Agencies and Activity Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Agencies */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Recent Agencies
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Latest onboarded service provider organizations
              </CardDescription>
            </div>
            <Link
              href="/super-admin/organizations"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
            >
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : orgs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No agencies found</p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {orgs.slice(0, 5).map((org) => (
                  <div key={org.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 font-bold text-xs text-blue-400">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{org.name}</p>
                        <p className="text-xs text-slate-400">{org.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="neutral"
                        className={
                          org.isActive
                            ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-400 text-xs'
                            : 'border-slate-700 bg-slate-800 text-slate-400 text-xs'
                        }
                      >
                        {org.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Platform Users */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Recent Activity & Users
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Recently registered platform users
              </CardDescription>
            </div>
            <Link
              href="/super-admin/users"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
            >
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No users found</p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {users.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 font-bold text-xs text-slate-300">
                        {user.fullName ? user.fullName.slice(0, 2).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {user.fullName ?? user.email}
                        </p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.isSocialOpsAdmin ? (
                        <Badge variant="info" className="border-purple-800/60 bg-purple-950/30 text-purple-300 text-xs">
                          SuperAdmin
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="border-slate-700 text-slate-400 text-xs">
                          {user.accountType ?? 'Member'}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}