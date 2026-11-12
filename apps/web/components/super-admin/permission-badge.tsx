'use client';

import { Badge } from '@/components/ui/badge';
import type { PlatformPermission } from '@/lib/super-admin-api';

interface PermissionBadgeProps {
  permission: PlatformPermission;
  variant?: 'default' | 'compact';
  className?: string;
}

/**
 * Display a single platform permission as a styled badge.
 * Uses the short key for compact display, full label on hover.
 */
export function PermissionBadge({
  permission,
  variant = 'default',
  className,
}: PermissionBadgeProps) {
  const shortKeys: Record<PlatformPermission, string> = {
    CLIENT_STATUS_MANAGEMENT: 'CLIENT_STATUS',
    AGENCY_DISCOVERY_APPROVAL: 'AGENCY_DISCOVERY',
    GLOBAL_ORG_READ: 'ORG_READ',
    GLOBAL_USER_READ: 'USER_READ',
    GLOBAL_CLIENT_READ: 'CLIENT_READ',
    GLOBAL_EMPLOYEE_READ: 'EMPLOYEE_READ',
    GLOBAL_CONTENT_READ: 'CONTENT_READ',
    PLATFORM_ROLE_GRANT: 'ROLE_GRANT',
    PLATFORM_ROLE_REVOKE: 'ROLE_REVOKE',
    PLATFORM_AUDIT_READ: 'AUDIT_READ',
    PLATFORM_SETTINGS_MANAGE: 'SETTINGS',
  };

  const labels: Record<PlatformPermission, string> = {
    CLIENT_STATUS_MANAGEMENT: 'Client Status Management',
    AGENCY_DISCOVERY_APPROVAL: 'Agency Discovery Approval',
    GLOBAL_ORG_READ: 'Global Organization Read',
    GLOBAL_USER_READ: 'Global User Read',
    GLOBAL_CLIENT_READ: 'Global Client Read',
    GLOBAL_EMPLOYEE_READ: 'Global Employee Read',
    GLOBAL_CONTENT_READ: 'Global Content Read',
    PLATFORM_ROLE_GRANT: 'Platform Role Grant',
    PLATFORM_ROLE_REVOKE: 'Platform Role Revoke',
    PLATFORM_AUDIT_READ: 'Platform Audit Read',
    PLATFORM_SETTINGS_MANAGE: 'Platform Settings Manage',
  };

  const shortKey = shortKeys[permission] ?? permission;
  const label = labels[permission] ?? permission;

  if (variant === 'compact') {
    return (
      <Badge
        variant="neutral"
        className={`bg-slate-800/50 border-slate-700 text-slate-300 text-[10px] ${className ?? ''}`}
        title={label}
      >
        {shortKey}
      </Badge>
    );
  }

  return (
    <Badge
      variant="neutral"
      className={`bg-slate-800/50 border-slate-700 text-slate-300 ${className ?? ''}`}
      title={label}
    >
      {shortKey}
    </Badge>
  );
}

interface PermissionBadgesProps {
  permissions: PlatformPermission[];
  maxVisible?: number;
  variant?: 'default' | 'compact';
  className?: string;
}

/**
 * Display multiple permissions as a group of badges.
 * Shows up to maxVisible badges, then a "+N more" badge.
 */
export function PermissionBadges({
  permissions,
  maxVisible = 3,
  variant = 'default',
  className,
}: PermissionBadgesProps) {
  if (!permissions.length) {
    return (
      <span className={`text-slate-500 text-xs italic ${className ?? ''}`}>
        No permissions
      </span>
    );
  }

  const visible = permissions.slice(0, maxVisible);
  const remaining = permissions.length - maxVisible;

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {visible.map((perm) => (
        <PermissionBadge key={perm} permission={perm} variant={variant} />
      ))}
      {remaining > 0 && (
        <Badge
          variant="muted"
          className="bg-slate-800/50 border-slate-700 text-slate-400 text-[10px]"
        >
          +{remaining} more
        </Badge>
      )}
    </div>
  );
}