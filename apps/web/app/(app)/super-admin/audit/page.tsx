'use client';

import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SuperAdminAuditPage() {
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
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            Audit Log Viewer
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Query audit events by action, principal, or resource.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-slate-400">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="mb-2 text-sm">Audit log viewer is coming soon.</p>
            <p className="text-xs">
              The backend <code className="rounded bg-slate-800/50 px-1 py-0.5 font-mono text-slate-500">/admin/audit-logs</code> endpoint is available behind step-up verification.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
