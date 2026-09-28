'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ClientSectionNav } from '@/components/clients/client-section-nav';
import { MetadataOnlyNotice } from '@/components/shared/metadata-only-notice';
import {
  SocialAccountForm,
  type SocialAccountFormSubmission,
} from '@/components/social-accounts/social-account-form';
import { SocialAccountList } from '@/components/social-accounts/social-account-list';
import { OAuthConnectButtons } from '@/components/social-accounts/oauth-connect-buttons';
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
  useStartOAuthConnect,
  useUpdateSocialAccount,
} from '@/hooks/use-social-accounts';
import { describeApiError } from '@/lib/api-error-messages';
import type { SocialAccountDto, SocialPlatform } from '@/types/social-account';

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
 * OAUTH CONNECT: this page DOES render the approved OAuth connect affordances
 * (Decision 013), shown only when the caller is OWNER/ADMIN - the same gate
 * the backend RoleGuard enforces on the connect route. The connect start
 * re-proves the ACTIVE ClientAgencyRelationship server-side, so the buttons
 * never become a way around the checks above. The metadata-only notice still
 * heads the section, because these rows are declared, not platform-verified.
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
  const connectMutation = useStartOAuthConnect('agency', clientId);
  const disconnectMutation = useDisconnectSocialAccount('agency', clientId);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  /**
   * Disconnect removes ONLY the stored credential; the metadata row is kept by
   * the backend, so the list simply flips the row back to "Connect".
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

  /**
   * OAuth requires a FULL-PAGE navigation: the authorization code is returned
   * to the platform's own callback, which the backend then exchanges. A fetch
   * or popup-less XHR can never complete a handshake, so we hand the browser
   * to the authorize URL and leave the page.
   */
  const startConnect = async (platform: SocialPlatform) => {
    const { authorizeUrl } = await connectMutation.mutateAsync(platform);
    window.location.assign(authorizeUrl);
  };

  const activeMembership = membershipsQuery.data?.memberships.find(
    (membership) => membership.organization.id === activeOrganizationId,
  );
  const canManage =
    activeMembership?.role === 'OWNER' || activeMembership?.role === 'ADMIN';

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
          Select an organization first to manage client social accounts.
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
      <ClientSectionNav clientId={clientId} active="social-accounts" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Social accounts
          </h2>
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

      {/* The backend requires OWNER/ADMIN on the connect route (RoleGuard +
          @RequireMinimumRole('ADMIN')); canManage is the UI mirror of that. */}
      {canManage && (
        <OAuthConnectButtons
          accounts={accountsQuery.data ?? []}
          scope="agency"
          clientId={clientId}
          canConnect={canManage}
          onStartConnect={startConnect}
        />
      )}

      {formState.mode !== 'closed' && canManage && (
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
          onStartConnect={(platform) => {
            void startConnect(platform);
          }}
          onDisconnect={(account) => {
            void handleDisconnect(account);
          }}
          disconnectingId={disconnectMutation.isPending ? disconnectingId : null}
        />
      )}
    </div>
  );
}