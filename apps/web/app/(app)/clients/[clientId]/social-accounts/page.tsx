'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { ClientContextHeader } from '@/components/clients/client-context-header';
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
import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useMyMemberships } from '@/hooks/use-my-memberships';
import { useSession } from '@/hooks/use-session';
import {
  useCreateSocialAccount,
  useSocialAccounts,
  useDisconnectSocialAccount,
  useStartOAuthConnectForAccount,
  useUpdateSocialAccount,
} from '@/hooks/use-social-accounts';
import { ApiError } from '@/lib/api';
import { describeApiError } from '@/lib/api-error-messages';
import type { SocialAccountDto } from '@/types/social-account';

/**
 * Agency-side Social Accounts for one Client (Client Operations V1).
 *
 * Authorization chain (mirrors the existing agency pages):
 *   - no request is issued without an active organization; apiFetch attaches
 *     the verified `X-Organization-Id`, and the backend proves an ACTIVE
 *     ClientAgencyRelationship on every call (uniform 404 otherwise);
 *   - create/edit are offered only when the caller's organization role is
 *     OWNER or ADMIN - a UI convenience; the backend RoleGuard +
 *     @RequireMinimumRole('ADMIN') remain authoritative.
 *
 * OAUTH CONNECT: each card's "Connect"/"Reconnect" button starts the ROW-SCOPED
 * handshake for that SocialAccount. The backend proves an ACTIVE relationship
 * and that the row belongs to this client, then puts the row id inside the
 * signed state so the callback UPDATES that same row with the platformAccountId
 * discovered from the platform - no duplicate row, and no manual id entry.
 * The metadata-only notice still heads the section: the platform id is only
 * present after a successful handshake.
 */
type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; account: SocialAccountDto };

export default function AgencyClientSocialAccountsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const membershipsQuery = useMyMemberships();

  const [formState, setFormState] = useState<FormState>({ mode: 'closed' });
  const [serverError, setServerError] = useState<string | null>(null);

  const orgReady = Boolean(activeOrganizationId && clientId);

  const accountsQuery = useSocialAccounts('agency', clientId);
  const createMutation = useCreateSocialAccount('agency', clientId);
  const updateMutation = useUpdateSocialAccount('agency', clientId);
  const disconnectMutation = useDisconnectSocialAccount('agency', clientId);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const connectForAccount = useStartOAuthConnectForAccount('agency', clientId);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  /**
   * Full-page redirect to the platform's authorize URL. An OAuth authorization
   * code can only be obtained by navigating the browser, never by a background
   * fetch, so this MUST end in window.location.assign.
   *
   * On success the platform calls the backend callback, which updates THIS row
   * (its id travelled inside the signed state) and attaches the credential.
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

  const activeMembership = membershipsQuery.data?.memberships.find(
    (membership) => membership.organization.id === activeOrganizationId,
  );
  const canManage =
    activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN';

  // A 404 from the client-scoped list means the client is not selectable in
  // this organization (no ACTIVE ClientAgencyRelationship). Hide the section
  // tabs: without a valid client they are meaningless.
  const clientMissing =
    accountsQuery.isError &&
    accountsQuery.error instanceof ApiError &&
    accountsQuery.error.status === 404;

  if (sessionLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!orgReady) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-slate-400">
          {membershipsQuery.isPending
            ? 'Loading your organizations…'
            : 'Select an organization first to manage client social accounts.'}
        </p>
        <Link
          href="/clients"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to clients
        </Link>
      </div>
    );
  }

  if (clientMissing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          Client not found in this organization.
        </div>
        <Link
          href="/clients"
          className="rounded text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ← Back to clients
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
      <ClientContextHeader clientId={clientId} />
      <ClientSectionNav clientId={clientId} active="social-accounts" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
            Social accounts
          </h3>
          <p className="text-sm text-slate-400">
            Platforms this client operates. Metadata only — recorded from what the
            client or agency declares.
          </p>
        </div>
        {canManage && formState.mode === 'closed' && (
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

      {formState.mode !== 'closed' && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {formState.mode === 'create' ? 'Add a social account' : 'Edit social account'}
            </CardTitle>
            <CardDescription>
              Recorded for this client only. Only non-secret metadata is stored. No
              password or access token is ever collected.
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
            'Unable to load social accounts for this client.',
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
          canManage={canManage}
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