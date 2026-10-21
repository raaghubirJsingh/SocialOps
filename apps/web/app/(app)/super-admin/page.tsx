import type { Metadata } from 'next';

import { SuperAdminDashboard } from '@/components/super-admin/super-admin-dashboard';

export const metadata: Metadata = {
  title: 'Super Admin Console · SocialOps',
  description: 'SocialOps platform administration console.',
};

/**
 * Super Admin dashboard route (/super-admin) — requires step-up session.
 *
 * This is the main Super Admin console. Access requires a valid
 * step-up session token (15 min, single-use). The token is validated
 * by the backend AdminStepUpGuard on every API call.
 */
export default function SuperAdminPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SuperAdminDashboard />
    </div>
  );
}