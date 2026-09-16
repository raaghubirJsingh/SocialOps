'use client';

import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { MetadataOnlyNotice } from '@/components/shared/metadata-only-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SELECT_CLASSES } from '@/components/ui/textarea';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  type CreateSocialAccountRequest,
  type SocialAccountDto,
  type SocialPlatform,
  type UpdateSocialAccountRequest,
} from '@/types/social-account';

/**
 * Social account create/edit form (METADATA ONLY).
 *
 * Hard scope rules enforced by construction:
 *   - there is NO credential input anywhere: no password, access token,
 *     refresh token, client secret, OAuth code/scope, and no "Connect"
 *     affordance;
 *   - `platform` is immutable on edit (approved D10), so it renders disabled;
 *   - empty optional inputs are sent as `null` (the backend schema requires a
 *     minimum length of 1 when a value is present);
 *   - the metadata-only notice is always visible, because these rows are
 *     declared and NOT verified against the platform.
 *
 * Validation mirrors apps/api/src/social-accounts/dto/*.dto.ts. React Hook
 * Form is wired to Zod through the same local resolver adapter the existing
 * forms use (@hookform/resolvers is deliberately not a dependency).
 */
const formSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().trim().max(200, 'Handle must be 200 characters or fewer.').optional(),
  displayName: z.string().trim().max(200, 'Display name must be 200 characters or fewer.').optional(),
  profileUrl: z.string().trim().max(500, 'URL must be 500 characters or fewer.').optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const resolver: Resolver<FormValues> = async (values) => {
  const parsed = formSchema.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };

  const errors: FieldErrors<FormValues> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      const field = key as keyof FormValues;
      if (!errors[field]) {
        errors[field] = { type: issue.code, message: issue.message };
      }
    }
  }
  return { values: {}, errors };
};

const emptyToNull = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type SocialAccountFormSubmission =
  | ({ mode: 'create' } & CreateSocialAccountRequest)
  | ({ mode: 'edit'; socialAccountId: string } & UpdateSocialAccountRequest);

interface SocialAccountFormProps {
  mode: 'create' | 'edit';
  initial?: SocialAccountDto;
  onSubmit: (submission: SocialAccountFormSubmission) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function SocialAccountForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: SocialAccountFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: {
      platform: initial?.platform ?? 'INSTAGRAM',
      handle: initial?.handle ?? '',
      displayName: initial?.displayName ?? '',
      profileUrl: initial?.profileUrl ?? '',
      isActive: initial?.isActive ?? true,
    },
  });

  const onFormSubmit = handleSubmit((values) => {
    const metadata = {
      handle: emptyToNull(values.handle),
      displayName: emptyToNull(values.displayName),
      profileUrl: emptyToNull(values.profileUrl),
      isActive: values.isActive,
    };

    if (mode === 'create') {
      return onSubmit({
        mode: 'create',
        platform: values.platform as SocialPlatform,
        ...metadata,
      });
    }

    return onSubmit({
      mode: 'edit',
      socialAccountId: initial?.id ?? '',
      ...metadata,
    });
  });

  return (
    <form onSubmit={onFormSubmit} className="space-y-4">
      <MetadataOnlyNotice />
      <div className="grid gap-2">
        <Label htmlFor="sa-platform" className="text-sm font-medium text-slate-300">
          Platform
        </Label>
        <select
          id="sa-platform"
          disabled={mode === 'edit' || isSubmitting}
          className={SELECT_CLASSES}
          {...register('platform')}
        >
          {SOCIAL_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {SOCIAL_PLATFORM_LABELS[platform]}
            </option>
          ))}
        </select>
        {mode === 'edit' ? (
          <p className="text-xs text-slate-500">
            The platform is fixed after creation. Create a new record to change it.
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sa-handle" className="text-sm font-medium text-slate-300">
          Handle <span className="text-slate-500">(optional)</span>
        </Label>
        <Input
          id="sa-handle"
          placeholder="@handle"
          disabled={isSubmitting}
          {...register('handle')}
        />
        {errors.handle && (
          <p className="text-xs text-red-400">{errors.handle.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sa-display" className="text-sm font-medium text-slate-300">
          Display name <span className="text-slate-500">(optional)</span>
        </Label>
        <Input id="sa-display" disabled={isSubmitting} {...register('displayName')} />
        {errors.displayName && (
          <p className="text-xs text-red-400">{errors.displayName.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sa-url" className="text-sm font-medium text-slate-300">
          Profile URL <span className="text-slate-500">(optional)</span>
        </Label>
        <Input
          id="sa-url"
          placeholder="https://instagram.com/…"
          disabled={isSubmitting}
          {...register('profileUrl')}
        />
        {errors.profileUrl && (
          <p className="text-xs text-red-400">{errors.profileUrl.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="sa-active"
          type="checkbox"
          className="h-4 w-4 rounded border-slate-700 bg-slate-900"
          disabled={isSubmitting}
          {...register('isActive')}
        />
        <Label htmlFor="sa-active" className="text-sm text-slate-300">
          Active record
        </Label>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : mode === 'create'
              ? 'Add account'
              : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}