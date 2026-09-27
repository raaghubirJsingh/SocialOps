'use client';

import { useState } from 'react';

import { PlatformBadge } from '@/components/social-accounts/platform-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeApiError } from '@/lib/api-error-messages';
import {
  SOCIAL_PLATFORMS,
  type SocialAccountDto,
  type SocialPlatform,
} from '@/types/social-account';

interface OAuthConnectButtonsProps {
  accounts: SocialAccountDto[];
  /** 'agency' routes via X-Organization-Id; 'mine' via X-Client-Id. */
  scope: 'agency' | 'mine';
  clientId: string;
  canConnect: boolean;
  onStartConnect: (platform: SocialPlatform) => Promise<void>;
}

/**
 * "Connect" affordances for the approved V1 platforms.
 *
 * A FULL-PAGE redirect is mandatory: an OAuth authorization code can only be
 * obtained by navigating the browser to the platform's authorize URL, never by
 * a background fetch. The redirect therefore happens in the page component
 * (which calls `window.location.assign`); this component only decides which
 * platforms still need connecting and reports the outcome back.
 *
 * The platform list is the approved V1 set only (Instagram, Facebook,
 * YouTube). A platform that already has a recorded account is not offered
 * again - re-connecting an existing platform is a separate concern and the
 * server upserts on its own composite key.
 */
export function OAuthConnectButtons({
  accounts,
  scope,
  clientId,
  canConnect,
  onStartConnect,
}: OAuthConnectButtonsProps) {
  const [busyPlatform, setBusyPlatform] = useState<SocialPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = new Set(accounts.map((a) => a.platform));
  const available = SOCIAL_PLATFORMS.filter((p) => !connected.has(p));

  if (!canConnect || available.length === 0) return null;

  const handleClick = async (platform: SocialPlatform) => {
    setError(null);
    setBusyPlatform(platform);
    try {
      await onStartConnect(platform);
    } catch (err) {
      setError(
        describeApiError(
          err,
          `Unable to start the ${platform} connection. Please try again.`,
        ),
      );
    } finally {
      setBusyPlatform(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect a platform</CardTitle>
        <CardDescription>
          Authorise {scope === 'agency' ? 'your agency' : 'your'} account with
          the platform. You will be sent to the platform to approve access;
          credentials are never shown or handled in the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {available.map((platform) => (
            <Button
              key={platform}
              type="button"
              size="sm"
              variant="secondary"
              disabled={busyPlatform !== null}
              onClick={() => {
                void handleClick(platform);
              }}
            >
              <span className="mr-2 inline-flex items-center gap-1.5">
                <PlatformBadge platform={platform} />
              </span>
              {busyPlatform === platform ? 'Redirecting…' : `Connect ${platform.toLowerCase()}`}
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Client scope: {scope} · {clientId ? 'binding verified server-side' : 'no client context'}
        </p>
      </CardContent>
    </Card>
  );
}
