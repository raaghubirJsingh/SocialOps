'use client';

import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ClientField } from '@/types/client';

interface FieldChangeModalProps {
  field: ClientField;
  currentValue: string | null;
  requirePassword: boolean;
  onSubmit: (data: { value: string; currentPassword?: string }) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}

const fieldChangeSchema = z.object({
  value: z.string().max(4000, 'Value must be 4000 characters or fewer'),
  currentPassword: z.string().min(1, 'Current password is required').max(200).optional(),
});

type FieldChangeFormValues = z.infer<typeof fieldChangeSchema>;

const fieldChangeResolver: Resolver<FieldChangeFormValues> = async (raw) => {
  const result = fieldChangeSchema.safeParse(raw);
  if (result.success) {
    return { values: result.data, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString();
    if (!key) continue;
    if (errors[key]) continue;
    errors[key] = { type: 'validation', message: issue.message };
  }
  return { values: {} as Record<string, never>, errors };
};

/**
 * Modal for field changes requiring re-authentication.
 * Used for security-controlled fields (NAME, DIRECT_EMAIL, DIRECT_MOBILE).
 *
 * Rendered through the shared `Dialog` primitive (components/ui/dialog.tsx)
 * instead of a second hand-rolled overlay: that gives the dialog
 * `role="dialog"`, `aria-modal`, a labelled title, Escape-to-close and
 * backdrop-click-to-close - none of which this component had before - plus the
 * single glass overlay treatment. The public props are unchanged, so the call
 * site in /client/profile is untouched.
 *
 * The action buttons live in the dialog footer and submit the form by id
 * (`form="field-change-form"`), which keeps the form markup and its
 * react-hook-form wiring exactly as they were.
 */
export function FieldChangeModal({
  field,
  currentValue,
  requirePassword,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: FieldChangeModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldChangeFormValues>({
    resolver: fieldChangeResolver,
    defaultValues: {
      value: currentValue ?? '',
      currentPassword: '',
    },
  });

  const onFormSubmit = handleSubmit((values) => {
    onSubmit({ value: values.value, currentPassword: values.currentPassword });
  });

  return (
    <Dialog
      open
      title={`Change ${field}`}
      description={
        requirePassword
          ? 'Re-enter your password to confirm this change.'
          : 'Enter the new value.'
      }
      onClose={onCancel}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" form="field-change-form" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        id="field-change-form"
        onSubmit={onFormSubmit}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="field-value">New value</Label>
          <Input
            id="field-value"
            defaultValue={currentValue ?? ''}
            disabled={isLoading}
            {...register('value')}
          />
          {errors.value && (
            <p className="text-xs text-red-400">{errors.value.message}</p>
          )}
        </div>

        {requirePassword && (
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              disabled={isLoading}
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="text-xs text-red-400">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}
