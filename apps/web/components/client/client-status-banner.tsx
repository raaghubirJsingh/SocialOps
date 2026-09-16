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

  // Amber (not Tailwind's `yellow`) so the inactive state matches the
  // `Badge variant="warning"` and the onboarding banner palette.
  const styles = isInactive
    ? 'border-amber-900/60 bg-amber-950/40 text-amber-200'
    : 'border-red-900/50 bg-red-950/30 text-red-200';

  // Explicit colour instead of `opacity-*`: stacking opacity on coloured text
  // pushes it under 4.5:1 against the dark composite.
  const secondaryStyles = isInactive ? 'text-amber-200/80' : 'text-red-200/80';
  const tertiaryStyles = isInactive ? 'text-amber-200/70' : 'text-red-200/70';

  const title = isInactive ? 'Account inactive' : 'Account suspended';

  const description = isInactive
    ? 'Your account is currently inactive. Some features may be limited.'
    : 'Your account has been suspended. Please contact support for assistance.';

  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${styles}`}
    >
      <p className="font-medium">{title}</p>
      <p className={`mt-1 ${secondaryStyles}`}>{description}</p>
      {reason && (
        <p className={`mt-1 text-xs ${tertiaryStyles}`}>Reason: {reason}</p>
      )}
    </div>
  );
}
