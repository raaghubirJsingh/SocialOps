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
  /**
   * Reconnect hand-off. The parent performs the full-page redirect to the
   * authorize URL - OAuth cannot be completed by a background fetch.
   */
  onStartConnect?: (platform: SocialAccountDto['platform']) => void;
  onDisconnect?: (account: SocialAccountDto) => void;
  /** Account id currently being disconnected, for the row's busy state. */
  disconnectingId?: string | null;
}

/**
 * Social account list (metadata only).
 *
 * Rows render ONLY non-secret metadata: platform, handle, display name, a
 * public profile link (marked external), the active flag, and timestamps. The
 * backend-derived `hasCredential` boolean drives the connection affordances:
 *
 *   - no credential  -> "Connect"   (start a new handshake)
 *   - has credential -> "Reconnect" (re-authorise; reuses the same endpoint)
 *                      + "Disconnect" (removes the stored credential; the
 *                      metadata row itself is kept server-side)
 *
 * No token, scope, expiry, or key-version information is displayed - none of
 * it is ever sent to the browser.
 */
export function SocialAccountList({
  accounts,
  canManage,
  onEdit,
  onStartConnect,
  onDisconnect,
  disconnectingId = null,
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
                {account.hasCredential ? (
                  <Badge variant="info">Connected</Badge>
                ) : null}
              </div>

              <p className="text-xs text-slate-400">
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
                  className="rounded text-xs text-blue-400 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  {account.profileUrl}
                </a>
              )}
            </div>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onEdit(account)}
                >
                  Edit
                </Button>
                {onStartConnect && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onStartConnect(account.platform)}
                  >
                    {account.hasCredential ? 'Reconnect' : 'Connect'}
                  </Button>
                )}
                {onDisconnect && account.hasCredential && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disconnectingId === account.id}
                    onClick={() => onDisconnect(account)}
                  >
                    {disconnectingId === account.id
                      ? 'Disconnecting…'
                      : 'Disconnect'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}