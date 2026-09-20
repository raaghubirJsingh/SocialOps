'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Edit, Lock } from 'lucide-react';

import { clientApi } from '@/lib/client-api';
import { useClientContext } from '@/components/client/client-provider';
import { FieldChangeModal } from '@/components/client/field-change-modal';
import { CooldownTimer } from '@/components/client/cooldown-timer';
import { ClientStatusBanner } from '@/components/client/client-status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { useMyClient } from '@/hooks/use-client-overview';
import type { ClientField, ClientDto } from '@/types/client';
import { ApiError } from '@/lib/api';
import { loadBoundClientId, saveBoundClientId } from '@/lib/client-session';

interface FieldConfig {
  field: ClientField;
  label: string;
  requiresPassword: boolean;
  hint?: string;
}

export const EDITABLE_PROFILE_FIELDS: readonly FieldConfig[] = Object.freeze([
  {
    field: 'WEBSITE',
    label: 'Website',
    requiresPassword: false,
    hint: 'Rate-limited changes — audited server-side.',
  },
  {
    field: 'INDUSTRY',
    label: 'Industry',
    requiresPassword: false,
    hint: 'Rate-limited changes — audited server-side.',
  },
  {
    field: 'DESCRIPTION',
    label: 'Description',
    requiresPassword: false,
    hint: 'Rate-limited changes — audited server-side.',
  },
]);

const INDUSTRY_OPTIONS: SelectOption[] = [
  { value: 'Beauty & Personal Care', label: 'Beauty & Personal Care' },
  { value: 'Education & E-learning', label: 'Education & E-learning' },
  { value: 'Entertainment & Media', label: 'Entertainment & Media' },
  { value: 'Finance & Insurance', label: 'Finance & Insurance' },
  { value: 'Fitness & Sports', label: 'Fitness & Sports' },
  { value: 'Food & Beverage', label: 'Food & Beverage' },
  { value: 'Healthcare & Wellness', label: 'Healthcare & Wellness' },
  { value: 'Manufacturing & Logistics', label: 'Manufacturing & Logistics' },
  { value: 'Non-Profit & NGO', label: 'Non-Profit & NGO' },
  { value: 'Professional Services', label: 'Professional Services' },
  { value: 'Real Estate & Property', label: 'Real Estate & Property' },
  { value: 'Retail & E-commerce', label: 'Retail & E-commerce' },
  { value: 'Technology & Software', label: 'Technology & Software' },
  { value: 'Travel & Hospitality', label: 'Travel & Hospitality' },
  { value: 'Other', label: 'Other' },
];

const FILL_FIELDS: readonly ClientField[] = Object.freeze([
  'WEBSITE',
  'INDUSTRY',
  'DESCRIPTION',
] as const);

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

function isFieldEmpty(client: ClientDto, field: ClientField): boolean {
  const val = getFieldValue(client, field);
  return val === null || val === '';
}

// Extend edit values to include INDUSTRY_OTHER
type EditValues = Partial<Record<ClientField, string>> & { INDUSTRY_OTHER?: string };
type FillValues = Partial<Record<ClientField, string>> & { INDUSTRY_OTHER?: string };

export default function ClientProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? loadBoundClientId() ?? '';
  const { client: contextClient, setClient } = useClientContext();
  const clientQuery = useMyClient(clientId);
  const client = clientQuery.data ?? contextClient;

  // ALL hooks must be called before any early return
  const [activeField, setActiveField] = useState<ClientField | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<EditValues>({});
  const [fillValues, setFillValues] = useState<FillValues>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<{ field: ClientField; expiresAt: string } | null>(null);

  // Now we can safely use client
  if (!client) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-slate-100">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  const emptyFillFields = FILL_FIELDS.filter((field) => isFieldEmpty(client, field));
  const filledFields = EDITABLE_PROFILE_FIELDS.filter(
    (fieldConfig) => !isFieldEmpty(client, fieldConfig.field) && fieldConfig.field !== 'DIRECT_EMAIL',
  );

  /** True when the "Complete your profile" form has at least one field with a value. */
  const isFillDirty =
    emptyFillFields.some((f) => {
      if (f === 'INDUSTRY') {
        return (
          (fillValues[f] !== undefined && fillValues[f] !== '' && fillValues[f] !== 'Other') ||
          (fillValues['INDUSTRY_OTHER']?.trim() ?? '') !== ''
        );
      }
      return (fillValues[f]?.trim() ?? '') !== '';
    });

  /** True when the edit form has any field changed from its original value. */
  const isEditDirty = EDITABLE_PROFILE_FIELDS.some((fc) => {
    if (fc.field === 'DIRECT_EMAIL') return false;
    const current = editValues[fc.field];
    const original = getFieldValue(client, fc.field);
    if (current === undefined) return false; // untouched
    return current !== (original ?? '');
  }) || (
    editValues['INDUSTRY'] === 'Other' &&
    (editValues['INDUSTRY_OTHER']?.trim() ?? '') !== ''
  );

  const activeFieldConfig = EDITABLE_PROFILE_FIELDS.find((f) => f.field === activeField);
  const activeFieldValue = activeField ? getFieldValue(client, activeField) : null;

  const handleEditClick = () => {
    const values: EditValues = {};
    for (const fieldConfig of EDITABLE_PROFILE_FIELDS) {
      const value = getFieldValue(client, fieldConfig.field);
      if (value) {
        values[fieldConfig.field] = value;
      }
    }
    if (client.industry) {
      values['INDUSTRY'] = client.industry;
    }
    setEditValues(values);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditValues({});
    setError(null);
  };

  const handleFieldChange = (field: ClientField | 'INDUSTRY_OTHER', value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFillChange = (field: ClientField | 'INDUSTRY_OTHER', value: string) => {
    setFillValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFillSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading || emptyFillFields.length === 0) return;

    const valuesToSave: Partial<Record<ClientField, string | null>> = {};
    for (const field of emptyFillFields) {
      if (field === 'INDUSTRY') {
        const industry = fillValues['INDUSTRY']?.trim();
        const otherIndustry = fillValues['INDUSTRY_OTHER']?.trim();
        if (industry === 'Other' && otherIndustry) {
          valuesToSave[field] = otherIndustry;
        } else if (industry && industry !== 'Other') {
          valuesToSave[field] = industry;
        }
      } else {
        const value = fillValues[field]?.trim();
        if (value) {
          valuesToSave[field] = value;
        }
      }
    }

    if (Object.keys(valuesToSave).length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      for (const [field, value] of Object.entries(valuesToSave)) {
        // Safety: never send empty strings to the backend.
        if (typeof value !== 'string' || value === '') continue;
        await clientApi.updateField(clientId, {
          field: field as ClientField,
          value,
        });
      }
      const updated = await clientApi.getMyClient(clientId);
      saveBoundClientId(updated.id);
      setClient(updated);
      // Clear the form so the dirty flag resets and fields that were just
      // saved disappear from the inline form on the next render.
      setFillValues({});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldSubmit = async (data: { value: string; currentPassword?: string }) => {
    if (!activeField || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      await clientApi.updateField(clientId, {
        field: activeField,
        value: data.value,
        currentPassword: data.currentPassword,
      });
      const updated = await clientApi.getMyClient(clientId);
      saveBoundClientId(updated.id);
      setClient(updated);
      router.refresh();
      setActiveField(null);
    } catch (err) {
      const apiError = err as ApiError;
      if ('retryAt' in apiError && typeof apiError.retryAt === 'string') {
        setCooldown({ field: activeField, expiresAt: apiError.retryAt });
      }
      setError(err instanceof Error ? err.message : 'Failed to update field.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          asChild
          onClick={() => router.push(`/client?clientId=${client.id}`)}
        >
          <div className="flex items-center gap-2 text-sm text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to dashboard
          </div>
        </Button>
      </div>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-100">Profile</h1>

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="surface-panel rounded-lg">
        {/* Identity section — strictly read-only for ACTIVE clients. */}
        <div className="border-b border-white/[0.06] px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Identity
          </p>
        </div>

        <div className="grid gap-4 border-b border-white/[0.06] px-6 py-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-300">Name</p>
            <p className="mt-1 text-slate-100">{client.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Verified identity — cannot be changed here
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">Phone</p>
            <p className="mt-1 text-slate-100">{client.directPhone}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Verified at sign-up — cannot be changed here
            </p>
          </div>
        </div>

        <div className="border-b border-white/[0.06] px-6 py-4">
          <p className="text-sm font-medium text-slate-300">Email</p>
          <p className="mt-1 text-slate-100">{client.directEmail}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Verified at sign-up - cannot be changed
          </p>
        </div>

        {filledFields.length > 0 && (
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <p className="text-sm font-medium text-slate-300">Optional details</p>
            <Button
              size="sm"
              variant={isEditing ? 'secondary' : 'default'}
              onClick={isEditing ? handleEditCancel : handleEditClick}
              disabled={isLoading}
              className="gap-2"
            >
              {isEditing ? (
                <>
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Cancel
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4" />
                  Edit details
                </>
              )}
            </Button>
          </div>
        )}

        {isEditing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isLoading) return;

              // Build a sanitized payload: only optional fields with actual values.
              const payload: Partial<Record<ClientField, string>> = {};
              for (const [field, value] of Object.entries(editValues)) {
                if (field === 'INDUSTRY_OTHER') continue;
                if (typeof value !== 'string' || value === '') continue;
                payload[field as ClientField] = value;
              }

              // Handle INDUSTRY "Other" case: use the custom text value instead.
              if (editValues['INDUSTRY'] === 'Other' && editValues['INDUSTRY_OTHER']) {
                payload.INDUSTRY = editValues['INDUSTRY_OTHER'];
              }

              setIsLoading(true);
              setError(null);
              try {
                for (const [field, value] of Object.entries(payload)) {
                  await clientApi.updateField(clientId, {
                    field: field as ClientField,
                    value,
                  });
                }
                const updated = await clientApi.getMyClient(clientId);
                saveBoundClientId(updated.id);
                setClient(updated);
                router.refresh();
                setIsEditing(false);
                setEditValues({});
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save changes.');
              } finally {
                setIsLoading(false);
              }
            }}
            className="border-t border-white/[0.06] px-6 py-4 space-y-4"
          >
            <p className="text-sm font-medium text-slate-300">Edit optional details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {EDITABLE_PROFILE_FIELDS.map((fieldConfig) => {
                if (fieldConfig.field === 'DIRECT_EMAIL') return null;

                const currentValue = (editValues[fieldConfig.field] ?? getFieldValue(client, fieldConfig.field) ?? '') as string;

                return (
                  <div key={fieldConfig.field} className="space-y-1.5">
                    <Label htmlFor={`edit-${fieldConfig.field}`} className="text-sm text-slate-300">
                      {fieldConfig.label}
                    </Label>
                    {fieldConfig.field === 'INDUSTRY' ? (
                      <Select
                        options={INDUSTRY_OPTIONS}
                        value={currentValue || null}
                        onChange={(value) => handleFieldChange(fieldConfig.field, value)}
                        showOtherOption
                        otherValue={editValues['INDUSTRY_OTHER'] ?? ''}
                        onOtherChange={(value) => handleFieldChange('INDUSTRY_OTHER', value)}
                      />
                    ) : (
                      <Input
                        id={`edit-${fieldConfig.field}`}
                        value={currentValue}
                        onChange={(e) => handleFieldChange(fieldConfig.field, e.target.value)}
                        disabled={isLoading}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={handleEditCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !isEditDirty} className="min-w-[120px]">
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        )}

        {!isEditing && (
          <>
            {filledFields.length > 0 && (
              <p className="border-b border-white/[0.06] px-6 py-4 text-sm font-medium text-slate-300">
                Optional details
              </p>
            )}
            {EDITABLE_PROFILE_FIELDS.map((fieldConfig) => {
              if (fieldConfig.field === 'DIRECT_EMAIL') return null;

              const value = getFieldValue(client, fieldConfig.field);
              if (!value) return null;

              return (
                <div
                  key={fieldConfig.field}
                  className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-300">{fieldConfig.label}</p>
                    <p className="text-slate-100">{value}</p>
                    {fieldConfig.hint && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {fieldConfig.hint}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {emptyFillFields.length > 0 && (
        <form onSubmit={handleFillSubmit} className="surface-panel space-y-4 rounded-lg p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Complete your profile</h2>
            <p className="mt-1 text-sm text-slate-400">
              These optional fields are still empty - fill any of them.
              Changes are audited server-side.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {emptyFillFields.map((field) => {
              const config = EDITABLE_PROFILE_FIELDS.find((f) => f.field === field);

              return (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`fill-${field}`} className="text-sm text-slate-300">
                    {config?.label ?? field}
                  </Label>
                  {field === 'INDUSTRY' ? (
                    <Select
                      options={INDUSTRY_OPTIONS}
                      value={fillValues[field] ?? null}
                      onChange={(value) => handleFillChange(field, value)}
                      showOtherOption
                      otherValue={fillValues['INDUSTRY_OTHER'] ?? ''}
                      onOtherChange={(value) => handleFillChange('INDUSTRY_OTHER', value)}
                    />
                  ) : (
                    <Input
                      id={`fill-${field}`}
                      value={fillValues[field] ?? ''}
                      onChange={(e) => handleFillChange(field, e.target.value)}
                      disabled={isLoading}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Button
            type="submit"
            disabled={isLoading || !isFillDirty}
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </form>
      )}

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

      {cooldown && (
        <CooldownTimer
          field={cooldown.field}
          expiresAt={cooldown.expiresAt}
          onCooldownExpired={() => setCooldown(null)}
        />
      )}

      <ClientStatusBanner status={client.status} reason={client.statusReason} />
    </div>
  );
}
