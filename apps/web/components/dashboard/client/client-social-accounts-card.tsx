'use client';

import Link from 'next/link';
import { ChevronRight, Facebook, Instagram, Link2, Youtube } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { describeApiError } from '@/lib/api-error-messages';
import {
  SOCIAL_PLATFORM_LABELS,
  type SocialAccountDto,
  type SocialPlatform,
} from '@/types/social-account';

const PLATFORM_ICONS: Record<SocialPlatform, typeof Instagram> = {
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  YOUTUBE: Youtube,
};

interface ClientSocialAccountsCardProps {
  accounts: SocialAccountDto[];
  isPending: boolean;
  error: unknown;
}

/**
 * Recorded social platforms (metadata only). Deliberate wording: rows show
 * "Recorded" — NEVER "Connected" — because no OAuth/credential link exists
 * (token storage is deferred; approved Decision 008). The UI must never
 * imply a live platform authorization.
 */
export function ClientSocialAccountsCard({
  accounts,
  isPending,
  error,
}: ClientSocialAccountsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-blue-400" aria-hidden="true" />
            Social accounts
            <span className="text-xs font-normal text-slate-400">
              {accounts.length} recorded
            </span>
          </CardTitle>
          <Link
            href="/client/social-accounts"
            className="flex items-center text-sm text-blue-400 transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            Manage
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <CardDescription>
          The platforms you operate, recorded as metadata only — no
          credentials are ever stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-slate-400">Loading social accounts…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-300">
            {describeApiError(error, 'Unable to load your social accounts.')}
          </p>
        ) : accounts.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              No social accounts recorded yet.
            </p>
            <Link
              href="/client/social-accounts"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              <PlusIcon />
              Add account
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {accounts.map((account) => {
              const Icon = PLATFORM_ICONS[account.platform];
              return (
                <li key={account.id}>
                  <Link
                    href="/client/social-accounts"
                    className="flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon
                        className="h-4 w-4 shrink-0 text-slate-300"
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm text-slate-200">
                        {SOCIAL_PLATFORM_LABELS[account.platform]}
                        {account.handle ? ` · ${account.handle}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-slate-500"
                        aria-hidden="true"
                      />
                      Recorded
                      <ChevronRight
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}