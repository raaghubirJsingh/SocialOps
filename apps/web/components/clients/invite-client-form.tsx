'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { describeApiError } from '@/lib/api-error-messages';
import { clientApi } from '@/lib/client-api';

/**
 * Agency-side Client invitation form (POST /api/clients/:id/invite).
 *
 * The recipient is the Client's saved `directEmail`, shown read-only. The
 * form posts an EMPTY body: the backend resolves the recipient from the
 * tenant-scoped Client row and its strict schema rejects any unexpected
 * field, so a caller-supplied email can never override the saved one. The
 * organization scope comes from the verified `X-Organization-Id` header
 * attached automatically by apiFetch.
 *
 * Delivery: the backend returns `{ invitationId, email, expiresAt }` and
 * NEVER the raw token. There is no email provider, so this UI only confirms
 * the invitation was created; in local development the invitation link is
 * written to the API log (BOOT_ARTIFACTS). The UI must never display, log,
 * or store a token.
 *
 * Backend authorization (OWNER/ADMIN, PENDING client) stays server-side
 * authoritative; the caller's role gate on the page is a UX convenience only.
 */

/**
 * Local mirror of the backend's email rule for `directEmail`, used only to
 * disable the action when the saved value is unusable. The backend remains
 * the authority.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

interface InviteClientFormProps {
  /** The PENDING, unbound client to invite an owner for. */
  clientId: string;
  /** The Client's saved direct email - the invitation recipient. */
  clientEmail: string;
  /** Called after the backend accepted the invitation. */
  onInvited: () => void;
  onCancel: () => void;
}

export function InviteClientForm({
  clientId,
  clientEmail,
  onInvited,
  onCancel,
}: InviteClientFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const emailValid = looksLikeEmail(clientEmail);

  async function submit() {
    setServerError(null);
    try {
      // Empty body by contract: the recipient is the Client's saved
      // directEmail, resolved server-side (inviteClientSchema is strict).
      const result = await clientApi.inviteClient(clientId, {});
      // Confirmation is email-only: no email was sent (no provider exists),
      // and no token is ever shown. The backend logs the link locally.
      setSuccessEmail(result.email);
      onInvited();
    } catch (err) {
      setServerError(
        describeApiError(err, 'Unable to create the invitation. Please try again.'),
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite client owner</CardTitle>
        <CardDescription>
          Send the owner invitation to this client&apos;s saved email address.
          They will accept the invitation and finish onboarding to bind the
          account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {successEmail ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Invitation created for {successEmail}.
            </p>
            <p className="text-xs text-slate-400">
              In local development the invitation link is written to the API
              log.
            </p>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Done
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-300">
                Invitation recipient
              </span>
              <p className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                {clientEmail}
              </p>
              {!emailValid && (
                <p className="text-xs text-red-400">
                  This client&apos;s saved email is missing or invalid. Fix the
                  client record before sending an invitation.
                </p>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
              >
                {serverError}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={!emailValid}>
                Send invitation
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
