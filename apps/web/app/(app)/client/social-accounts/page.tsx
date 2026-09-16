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
  useUpdateSocialAccount,
} from '@/hooks/use-social-accounts';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import type { SocialAccountDto } from '@/types/social-account';

/**
 * Client self-service: my social accounts (METADATA ONLY).
 *
 * `clientId` comes from the `?clientId=` query parameter, exactly like the
 * existing `/client/...` pages; it is only a LOOKUP hint. The backend re-verifies
 * the `X-Client-Id` header against the authenticated user's direct Client
 * binding (and onboarding ACTIVE) on every request, so a forged value cannot
 * reach another client's data.
 *
 * As the owner, the client may always manage its own records (no role gate),
 * and the page carries no OAuth affordance of any kind.
 */
type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; account: SocialAccountDto };

export default function ClientSocialAccountsPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? '';
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const [formState, setFormState] = useState<FormState>({ mode: 'closed' });
  const [serverError, setServerError] = useState<string | null>(null);

  const accountsQuery = useSocialAccounts('mine', clientId);
  const createMutation = useCreateSocialAccount('mine', clientId);
  const updateMutation = useUpdateSocialAccount('mine', clientId);

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
        <Link href="/client" className="text-sm text-blue-400 hover:underline">
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
          <h2 className="text-2xl font-semibold text-slate-100">Social accounts</h2>
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
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
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
        />
      )}
    </div>
  );
}