import { PlatformBadge } from '@/components/social-accounts/platform-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SocialAccountDto } from '@/types/social-account';

interface SocialAccountListProps {
  accounts: SocialAccountDto[];
  /** UI convenience only: the backend RoleGuard is the real authority. */
  canManage: boolean;
  onEdit: (account: SocialAccountDto) => void;
}

/**
 * Social account list (metadata only).
 *
 * Rows render ONLY non-secret metadata: platform, handle, display name, a
 * public profile link (marked external), the active flag, and timestamps.
 * There is no connection status to render - nothing is connected in V1 - and
 * no token/expiry/scope information exists to display.
 */
export function SocialAccountList({
  accounts,
  canManage,
  onEdit,
}: SocialAccountListProps) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No social accounts recorded</CardTitle>
          <CardDescription>
            {canManage
              ? 'Add the platforms this client operates, so future content work can reference them.'
              : 'No social accounts have been recorded for this client yet.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <Card key={account.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformBadge platform={account.platform} />
                <span className="text-sm font-medium text-slate-200">
                  {account.handle ?? account.displayName ?? 'Unnamed account'}
                </span>
                {account.isActive ? (
                  <Badge variant="neutral">Active</Badge>
                ) : (
                  <Badge variant="muted">Inactive</Badge>
                )}
              </div>

              <p className="text-xs text-slate-500">
                {account.platformAccountId
                  ? `Platform id ${account.platformAccountId}`
                  : 'Platform id not recorded'}
                {' · '}
                added {new Date(account.createdAt).toLocaleDateString()}
              </p>

              {account.profileUrl && (
                <a
                  href={account.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-blue-400 underline-offset-4 hover:underline"
                >
                  {account.profileUrl}
                </a>
              )}
            </div>

            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onEdit(account)}
              >
                Edit
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}