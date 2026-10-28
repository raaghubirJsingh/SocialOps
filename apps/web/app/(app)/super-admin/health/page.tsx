'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Activity, Database, Wifi } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface HealthCheckResult {
  status: 'ok' | 'error';
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  database: HealthCheckResult;
  redis: HealthCheckResult;
}

export default function SuperAdminHealthPage() {
  const { data: healthData, isLoading } = useQuery({
    queryKey: ['superadmin', 'health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    retry: false,
  });

  const isHealthy = healthData?.status === 'ok';

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
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">System Health</h1>
        <p className="text-sm text-slate-400">
          Monitor the operational status of SocialOps platform services.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" />
            Overall Status
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Aggregated health of all platform services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Badge variant="neutral" className="bg-slate-800 text-slate-400">
                Checking…
              </Badge>
            ) : isHealthy ? (
              <Badge variant="success" className="bg-emerald-950/30 text-emerald-400 border-emerald-800/50">
                All Systems Operational
              </Badge>
            ) : (
              <Badge variant="danger" className="bg-red-950/30 text-red-400 border-red-800/50">
                Degraded
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              Database (PostgreSQL)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Primary tenant data store
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Badge variant="neutral" className="bg-slate-800 text-slate-400">
                Checking…
              </Badge>
            ) : (
              <Badge
                variant={healthData?.database.status === 'ok' ? 'success' : 'danger'}
                className={
                  healthData?.database.status === 'ok'
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/50'
                    : 'bg-red-950/30 text-red-400 border-red-800/50'
                }
              >
                {healthData?.database.status === 'ok' ? 'Connected' : 'Error'}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-400" />
              Cache (Redis)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Session cache and background queue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Badge variant="neutral" className="bg-slate-800 text-slate-400">
                Checking…
              </Badge>
            ) : (
              <Badge
                variant={healthData?.redis.status === 'ok' ? 'success' : 'danger'}
                className={
                  healthData?.redis.status === 'ok'
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/50'
                    : 'bg-red-950/30 text-red-400 border-red-800/50'
                }
              >
                {healthData?.redis.status === 'ok' ? 'Connected' : 'Error'}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
