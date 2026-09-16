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
  useUpdateSocialAccount,
} from '@/hooks/use-social-accounts';
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
 * METADATA ONLY: this page has no OAuth affordance of any kind, and the
 * metadata-only notice heads the section.
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
        <Link href="/clients" className="text-sm text-blue-400 hover:underline">
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
          <h2 className="text-2xl font-semibold text-slate-100">Social accounts</h2>
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
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
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
        />
      )}
    </div>
  );
}