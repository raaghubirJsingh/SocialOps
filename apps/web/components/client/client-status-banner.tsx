'use client';

import type { ClientStatus } from '@/types/client';

interface ClientStatusBannerProps {
  status: ClientStatus;
  reason?: string | null;
}

/**
 * Banner shown for INACTIVE or SUSPENDED client states.
 */
export function ClientStatusBanner({ status, reason }: ClientStatusBannerProps) {
  if (status === 'ACTIVE') return null;

  const isInactive = status === 'INACTIVE';

  const styles = isInactive
    ? 'border-yellow-900/50 bg-yellow-950/30 text-yellow-200'
    : 'border-red-900/50 bg-red-950/30 text-red-200';

  const title = isInactive ? 'Account inactive' : 'Account suspended';

  const description = isInactive
    ? 'Your account is currently inactive. Some features may be limited.'
    : 'Your account has been suspended. Please contact support for assistance.';

  return (
    <div
      role="alert"
      className={`rounded-md border px-4 py-3 text-sm ${styles}`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 opacity-80">{description}</p>
      {reason && <p className="mt-1 text-xs opacity-60">Reason: {reason}</p>}
    </div>
  );
}
