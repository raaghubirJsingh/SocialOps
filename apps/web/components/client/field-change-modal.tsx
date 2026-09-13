'use client';

import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-slate-900 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-100">
          Change {field}
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {requirePassword
            ? 'Re-enter your password to confirm this change.'
            : 'Enter the new value.'}
        </p>

        <form onSubmit={onFormSubmit} className="mt-4 space-y-4">
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
              className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
