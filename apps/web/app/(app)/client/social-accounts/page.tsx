'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { MetadataOnlyNotice } from '@/components/shared/metadata-only-notice';
import {
  SocialAccountForm,
  type SocialAccountFormSubmission,
} from '@/components/social-accounts/social-account-form';
import { SocialAccountList } from '@/components/social-accounts/social-account-list';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useCreateSocialAccount,
  useSocialAccounts,
  useDisconnectSocialAccount,
  useStartOAuthConnectForAccount,
  useUpdateSocialAccount,
} from '@/hooks/use-social-accounts';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { loadBoundClientId } from '@/lib/client-session';
import type { SocialAccountDto } from '@/types/social-account';

/**
 * Client self-service: my social accounts (METADATA ONLY).
 *
 * `clientId` comes from the `?clientId=` query parameter, exactly like the
 * existing `/client/...` pages; it is only a LOOKUP hint. When the parameter
 * is missing (sidebar / dashboard navigation), the last server-verified
 * binding is used as the hint. The backend re-verifies
 * the `X-Client-Id` header against the authenticated user's direct Client
 * binding (and onboarding ACTIVE) on every request, so a forged value cannot
 * reach another client's data.
 *
 * As the owner, the client may always manage its own records (no role gate).
 *
 * OAuth connect: each card's "Connect"/"Reconnect" button starts the ROW-SCOPED
 * handshake for that SocialAccount. The backend re-verifies the `X-Client-Id`
 * binding, proves the row belongs to this client, and carries the row id inside
 * the signed state, so the callback UPDATES that same row with the
 * platformAccountId discovered from the platform - no duplicate row, and no
 * manual platform id entry. The metadata-only notice still heads the section.
 */
type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; account: SocialAccountDto };

export default function ClientSocialAccountsPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const [formState, setFormState] = useState<FormState>({ mode: 'closed' });
  const [serverError, setServerError] = useState<string | null>(null);

  const accountsQuery = useSocialAccounts('mine', clientId);
  const createMutation = useCreateSocialAccount('mine', clientId);
  const updateMutation = useUpdateSocialAccount('mine', clientId);
  const disconnectMutation = useDisconnectSocialAccount('mine', clientId);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const connectForAccount = useStartOAuthConnectForAccount('mine', clientId);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  /**
   * Full-page redirect to the platform's authorize URL - OAuth cannot be
   * completed by a background fetch. On success the backend callback updates
   * THIS row with the discovered platformAccountId.
   */
  const handleStartConnect = async (account: SocialAccountDto) => {
    setServerError(null);
    setConnectingId(account.id);
    try {
      const { authorizeUrl } = await connectForAccount.mutateAsync(account.id);
      window.location.assign(authorizeUrl);
    } catch (error) {
      setServerError(
        describeApiError(
          error,
          `Unable to start the ${account.platform} connection. Please try again.`,
        ),
      );
    } finally {
      setConnectingId(null);
    }
  };

  /**
   * Disconnect removes ONLY the stored credential; the metadata row is kept by
   * the backend, so the list re-renders without the "Connected" badge.
   */
  const handleDisconnect = async (account: SocialAccountDto) => {
    setServerError(null);
    setDisconnectingId(account.id);
    try {
      await disconnectMutation.mutateAsync(account.id);
    } catch (error) {
      setServerError(
        describeApiError(
          error,
          'Unable to disconnect this account. Please try again.',
        ),
      );
    } finally {
      setDisconnectingId(null);
    }
  };

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          No client context in this session. Open your client dashboard and start
          from there.
        </p>
        <Link
          href="/client"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to client dashboard
        </Link>
      </div>
    );
  }

  const closeForm = () => {
    setFormState({ mode: 'closed' });
    setServerError(null);
  };

  const handleSubmit = async (submission: SocialAccountFormSubmission) => {
    setServerError(null);
    try {
      if (submission.mode === 'create') {
        await createMutation.mutateAsync({
          platform: submission.platform,
          handle: submission.handle,
          displayName: submission.displayName,
          profileUrl: submission.profileUrl,
          isActive: submission.isActive,
        });
      } else {
        await updateMutation.mutateAsync({
          socialAccountId: submission.socialAccountId,
          body: {
            handle: submission.handle,
            displayName: submission.displayName,
            profileUrl: submission.profileUrl,
            isActive: submission.isActive,
          },
        });
      }
      closeForm();
    } catch (error) {
      setServerError(
        describeApiError(
          error,
          'Unable to save the social account. Please try again.',
        ),
      );
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Social accounts
          </h2>
          <p className="text-sm text-slate-400">
            The platforms you operate, recorded as reference for content work.
          </p>
        </div>
        {formState.mode === 'closed' && (
          <Button type="button" onClick={() => setFormState({ mode: 'create' })}>
            Add account
          </Button>
        )}
      </header>

      <MetadataOnlyNotice />

      {/*
        Page-level error surface. `serverError` is ALSO handed to the form below,
        but the form only renders while it is open - so a failure from a
        CARD-level action (Connect / Disconnect), which never opens the form,
        used to be set into state and never rendered anywhere. The user saw
        nothing at all. This alert closes that gap.
      */}
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {serverError}
        </div>
      )}

      {formState.mode !== 'closed' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {formState.mode === 'create'
                ? 'Add a social account'
                : 'Edit social account'}
            </CardTitle>
            <CardDescription>
              Only non-secret metadata is stored. No password or access token is
              ever collected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SocialAccountForm
              mode={formState.mode === 'create' ? 'create' : 'edit'}
              initial={formState.mode === 'edit' ? formState.account : undefined}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={serverError}
            />
          </CardContent>
        </Card>
      )}

      {accountsQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {describeApiError(
            accountsQuery.error,
            'Unable to load your social accounts.',
          )}
        </div>
      ) : accountsQuery.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Loading social accounts…</p>
          </CardContent>
        </Card>
      ) : (
        <SocialAccountList
          accounts={accountsQuery.data}
          canManage
          onEdit={(account) => {
            setServerError(null);
            setFormState({ mode: 'edit', account });
          }}
          onDisconnect={(account) => {
            void handleDisconnect(account);
          }}
          onStartConnect={(account) => {
            void handleStartConnect(account);
          }}
          connectingId={connectForAccount.isPending ? connectingId : null}
          disconnectingId={disconnectMutation.isPending ? disconnectingId : null}
        />
      )}
    </div>
  );
}