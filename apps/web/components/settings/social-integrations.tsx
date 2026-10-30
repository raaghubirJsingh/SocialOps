'use client';

import { useSocialAccounts, useDisconnectSocialAccount } from '@/hooks/use-social-accounts';
import { SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS } from '@/types/social-account';

export interface SocialIntegrationsPanelProps {
  scope: 'agency' | 'mine';
  clientId: string;
}

export function SocialIntegrationsPanel({
  scope,
  clientId,
}: SocialIntegrationsPanelProps) {
  const { data: accounts = [], isLoading } = useSocialAccounts(scope, clientId);
  const disconnect = useDisconnectSocialAccount(scope, clientId);

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading integrations…</p>;
  }

  return (
    <div className="space-y-3">
      {SOCIAL_PLATFORMS.map((platform) => {
        const account = accounts.find((a) => a.platform === platform);
        return (
          <div
            key={platform}
            className="flex items-center justify-between rounded-lg border border-slate-800 p-3"
          >
            <div>
              <p className="text-sm font-medium text-slate-100">
                {SOCIAL_PLATFORM_LABELS[platform]}
              </p>
              <p className="text-xs text-slate-400">
                {account
                  ? account.hasCredential
                    ? 'Connected'
                    : 'Not connected'
                  : 'Not added'}
              </p>
            </div>
            {account?.hasCredential ? (
              <button
                type="button"
                onClick={() => disconnect.mutate(account.id)}
                className="text-xs text-red-400 hover:underline"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}