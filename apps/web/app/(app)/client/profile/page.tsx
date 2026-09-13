'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { clientApi } from '@/lib/client-api';
import { useClientContext } from '@/components/client/client-provider';
import { FieldChangeModal } from '@/components/client/field-change-modal';
import { CooldownTimer } from '@/components/client/cooldown-timer';
import { ClientStatusBanner } from '@/components/client/client-status-banner';
import { Button } from '@/components/ui/button';
import type { ClientField, ClientDto } from '@/types/client';
import { ApiError } from '@/lib/api';

interface FieldConfig {
  field: ClientField;
  label: string;
  requiresPassword: boolean;
}

const CLIENT_FIELDS: FieldConfig[] = [
  { field: 'NAME', label: 'Name', requiresPassword: true },
  { field: 'DIRECT_EMAIL', label: 'Email', requiresPassword: true },
  { field: 'DIRECT_MOBILE', label: 'Phone', requiresPassword: true },
  { field: 'PRIMARY_CONTACT_NAME', label: 'Primary Contact Name', requiresPassword: false },
  { field: 'PRIMARY_CONTACT_MOBILE', label: 'Primary Contact Phone', requiresPassword: false },
  { field: 'WEBSITE', label: 'Website', requiresPassword: false },
  { field: 'INDUSTRY', label: 'Industry', requiresPassword: false },
  { field: 'DESCRIPTION', label: 'Description', requiresPassword: false },
];

function getFieldValue(client: ClientDto, field: ClientField): string | null {
  switch (field) {
    case 'NAME': return client.name;
    case 'DIRECT_EMAIL': return client.directEmail;
    case 'DIRECT_MOBILE': return client.directPhone;
    case 'PRIMARY_CONTACT_NAME': return client.primaryContactName;
    case 'PRIMARY_CONTACT_MOBILE': return client.primaryContactPhone;
    case 'WEBSITE': return client.website;
    case 'INDUSTRY': return client.industry;
        case 'DESCRIPTION': return client.description;
    default: return null;
  }
}

export default function ClientProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') || '';
  const { client, setClient } = useClientContext();
  const [activeField, setActiveField] = useState<ClientField | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRetryAt, setCooldownRetryAt] = useState<string | null>(null);
  const [pendingChangeId, setPendingChangeId] = useState<string | null>(null);

  if (!client) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="text-sm text-slate-400">No client data available.</p>
      </div>
    );
  }

  const handleFieldSubmit = async (data: { value: string; currentPassword?: string }) => {
    if (!activeField) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await clientApi.updateField(clientId || client.id, {
        field: activeField,
        value: data.value,
        currentPassword: data.currentPassword,
      });
      if (result.status === 'APPLIED') {
        const updated = await clientApi.getMyClient(clientId || client.id);
        setClient(updated);
        setActiveField(null);
      } else if (result.status === 'PENDING_VERIFICATION' && result.changeId) {
        setPendingChangeId(result.changeId);
        setActiveField(null);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          const body = err.body as { code?: string; retryAt?: string };
          if (body.code === 'COOLDOWN_ACTIVE' && body.retryAt) {
            setCooldownRetryAt(body.retryAt);
          } else if (body.code === 'VERIFICATION_REQUIRED') {
            setError('Re-authentication is required for this field.');
          } else {
            setError(err.message || 'Failed to update field.');
          }
        } else if (err.status === 403) {
          setError('Client is not operationally active.');
        } else if (err.status === 401) {
          setError('Authentication required.');
          router.push('/login');
        } else {
          setError(err.message || 'Failed to update field.');
        }
      } else if (err instanceof Error) {
        setError(err.message || 'Failed to update field.');
      } else {
        setError('Failed to update field.');
      }
        } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyFieldChange = async (token: string) => {
    if (!pendingChangeId) return;
    try {
      setIsLoading(true);
      setError(null);
      await clientApi.verifyFieldChange(clientId || client.id, pendingChangeId, { token });
      const updated = await clientApi.getMyClient(clientId || client.id);
      setClient(updated);
      setPendingChangeId(null);
    } catch (err: unknown) {
      if (err instanceof ApiError || err instanceof Error) {
        setError(err.message || 'Verification failed.');
      } else {
        setError('Verification failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const activeFieldConfig = CLIENT_FIELDS.find((f) => f.field === activeField);
  const activeFieldValue = activeField ? getFieldValue(client, activeField) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-slate-100">Profile</h1>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {cooldownRetryAt && (
        <CooldownTimer retryAt={cooldownRetryAt} onExpire={() => setCooldownRetryAt(null)} />
      )}

      {pendingChangeId && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Verification required</p>
          <p className="mt-1 text-amber-300/80">
            A verification token has been sent. Enter it below to complete the change.
          </p>
          <div className="mt-3">
            <label htmlFor="verify-token" className="text-xs text-amber-300">
              Verification Token
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="verify-token"
                type="text"
                className="flex-1 rounded border border-amber-800 bg-amber-950 px-3 py-1 text-sm text-amber-100"
                placeholder="Enter token"
              />
              <Button
                size="sm"
                onClick={() => {
                  const input = document.getElementById('verify-token') as HTMLInputElement;
                  if (input.value) handleVerifyFieldChange(input.value);
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900">
        {CLIENT_FIELDS.map((fieldConfig) => (
          <div
            key={fieldConfig.field}
            className="flex items-center justify-between border-b border-slate-800 px-6 py-4 last:border-b-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-300">{fieldConfig.label}</p>
              <p className="text-slate-100">
                {getFieldValue(client, fieldConfig.field) || '-'}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveField(fieldConfig.field)}
              disabled={isLoading}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>

      {activeField && activeFieldConfig && (
        <FieldChangeModal
          field={activeField}
          currentValue={activeFieldValue}
          requirePassword={activeFieldConfig.requiresPassword}
          onSubmit={handleFieldSubmit}
          onCancel={() => setActiveField(null)}
          isLoading={isLoading}
          error={error}
        />
      )}

      <ClientStatusBanner status={client.status} reason={client.statusReason} />
    </div>
  );
}