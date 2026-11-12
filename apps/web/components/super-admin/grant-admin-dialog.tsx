'use client';

import { useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { UserPlus, Shield, Loader2, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

import { grantPlatformAdmin } from '@/lib/super-admin-api';
import type { PlatformPermission, GrantPlatformAdminRequest } from '@/lib/super-admin-api';
import { getPermissionLabel, ALL_PLATFORM_PERMISSIONS } from '@/lib/super-admin-api';

const grantSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  permissions: z.array(z.string()).optional(),
});

export type GrantAdminFormValues = z.infer<typeof grantSchema>;

const grantResolver: Resolver<GrantAdminFormValues> = async (raw) => {
  const result = grantSchema.safeParse(raw);
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

interface GrantAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GrantAdminDialog({ open, onClose, onSuccess }: GrantAdminDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GrantAdminFormValues>({
    resolver: grantResolver,
    mode: 'onBlur',
    defaultValues: {
      userId: '',
      permissions: ALL_PLATFORM_PERMISSIONS,
    },
  });

  const selectedPermissions = watch('permissions') ?? ALL_PLATFORM_PERMISSIONS;

  const handlePermissionToggle = useCallback((permission: PlatformPermission) => {
    const current = selectedPermissions;
    const newPermissions = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    setValue('permissions', newPermissions, { shouldValidate: true });
  }, [selectedPermissions, setValue]);

  const onSubmit = handleSubmit(async (values: GrantAdminFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const request: GrantPlatformAdminRequest = {
        userId: values.userId,
        permissions: (values.permissions ?? ALL_PLATFORM_PERMISSIONS) as PlatformPermission[],
      };
      await grantPlatformAdmin(request);
      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Failed to grant platform admin. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  if (submitSuccess) {
    return (
      <Dialog
        open={open}
        title="Platform Admin Granted"
        description="The user has been granted platform administrator privileges."
        onClose={onClose}
        dismissible={false}
        footer={
          <Button variant="default" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-center text-center py-8">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <p className="mt-4 text-slate-200">Platform admin privileges have been granted successfully.</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      title="Grant Platform Admin"
      description="Enter the user ID and select permissions. All permissions are granted by default."
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="default" type="submit" form="grant-admin-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Grant Admin'}
          </Button>
        </div>
      }
    >
      <form id="grant-admin-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {submitError && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            {submitError}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="userId">User ID (UUID)</Label>
          <Input
            id="userId"
            type="text"
            placeholder="00000000-0000-0000-0000-000000000000"
            aria-invalid={errors.userId ? 'true' : undefined}
            aria-describedby={errors.userId ? 'userId-error' : undefined}
            disabled={isSubmitting}
            {...register('userId')}
          />
          {errors.userId && (
            <p id="userId-error" className="text-xs text-red-400">
              {errors.userId.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Permissions</Label>
          <div className="space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  className="w-full justify-start text-left font-normal"
                  disabled={isSubmitting}
                  type="button"
                >
                  <span className="flex-1 text-slate-100">
                    {selectedPermissions.length === ALL_PLATFORM_PERMISSIONS.length
                      ? 'All permissions (default)'
                      : `${selectedPermissions.length} permissions selected`}
                  </span>
                  <svg
                    className="ml-auto h-4 w-4 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 max-h-96">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Global Read
                </div>
                {ALL_PLATFORM_PERMISSIONS
                  .filter((p) => p.startsWith('GLOBAL_'))
                  .map((perm) => (
                    <DropdownMenuItem
                      key={perm}
                      onClick={() => handlePermissionToggle(perm)}
                      disabled={isSubmitting}
                      className="cursor-pointer"
                    >
                      {getPermissionLabel(perm)}
                      {selectedPermissions.includes(perm) && (
                        <svg
                          className="ml-auto h-4 w-4 text-blue-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Platform Roles
                </div>
                {ALL_PLATFORM_PERMISSIONS
                  .filter((p) => p.startsWith('PLATFORM_ROLE_'))
                  .map((perm) => (
                    <DropdownMenuItem
                      key={perm}
                      onClick={() => handlePermissionToggle(perm)}
                      disabled={isSubmitting}
                      className="cursor-pointer"
                    >
                      {getPermissionLabel(perm)}
                      {selectedPermissions.includes(perm) && (
                        <svg
                          className="ml-auto h-4 w-4 text-blue-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Platform Operations
                </div>
                {ALL_PLATFORM_PERMISSIONS
                  .filter(
                    (p) =>
                      p.startsWith('PLATFORM_') && !p.startsWith('PLATFORM_ROLE_')
                  )
                  .map((perm) => (
                    <DropdownMenuItem
                      key={perm}
                      onClick={() => handlePermissionToggle(perm)}
                      disabled={isSubmitting}
                      className="cursor-pointer"
                    >
                      {getPermissionLabel(perm)}
                      {selectedPermissions.includes(perm) && (
                        <svg
                          className="ml-auto h-4 w-4 text-blue-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Client & Agency
                </div>
                {ALL_PLATFORM_PERMISSIONS
                  .filter(
                    (p) =>
                      !p.startsWith('GLOBAL_') &&
                      !p.startsWith('PLATFORM_')
                  )
                  .map((perm) => (
                    <DropdownMenuItem
                      key={perm}
                      onClick={() => handlePermissionToggle(perm)}
                      disabled={isSubmitting}
                      className="cursor-pointer"
                    >
                      {getPermissionLabel(perm)}
                      {selectedPermissions.includes(perm) && (
                        <svg
                          className="ml-auto h-4 w-4 text-blue-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-slate-500">
              Default: All {ALL_PLATFORM_PERMISSIONS.length} permissions. Uncheck to customize.
            </p>
          </div>
        </div>
      </form>
    </Dialog>
  );
}